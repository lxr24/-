from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, exists, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.message import (
    Conversation,
    ConversationMember,
    DeletedMessage,
    Message,
)
from app.models.user_management import (
    User,
    get_batch_friendship_status,
    get_friendship_status,
)
from app.schemas.message import (
    ConversationResponse,
    CreateConversationRequest,
    CreateConversationResponse,
    MarkReadRequest,
    MessageResponse,
)

from app.api.websocket import manager
from .helpers import ACTIVE_GROUP_ROLES, find_private_conversation


SHANGHAI = "Asia/Shanghai"

router = APIRouter()


@router.get("/list", response_model=list[ConversationResponse])
async def get_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取当前用户的所有会话列表"""
    user_id = current_user["user_id"]

    # 1. 获取用户的所有会话成员信息
    member_rows, conv_ids = await _get_user_conversation_members(db, user_id)
    if not conv_ids:
        return []

    # 2. 批量查询会话信息
    conversations = await _get_conversations_by_ids(db, conv_ids)

    # 3. 批量查询最后一条消息
    last_messages = await _get_last_messages_by_conversations(
        db, conv_ids, user_id
    )

    # 4. 批量查询未读数
    unread_counts = await _get_unread_counts(
        db, conv_ids, user_id, conversations
    )

    # 5. 批量查询私聊对方用户信息
    private_avatars = await _get_private_chat_partners(db, conv_ids, user_id)

    # 6. 构建并返回结果
    return await _build_conversation_responses(
        conv_ids, member_rows, conversations,
        last_messages, unread_counts, private_avatars, user_id, db
    )


async def _get_conversations_by_ids(
    db: AsyncSession,
    conv_ids: list[int]
) -> dict[int, Conversation]:
    """批量获取会话信息"""
    conv_result = await db.execute(
        select(Conversation).where(Conversation.conversation_id.in_(conv_ids))
    )
    return {c.conversation_id: c for c in conv_result.scalars().all()}


async def _get_last_messages_by_conversations(
    db: AsyncSession,
    conv_ids: list[int],
    user_id: int
) -> dict[int, Message]:
    """批量获取每个会话的最后一条消息（排除已删除的）"""
    # 子查询：每个会话的最大msg_id
    last_msg_subquery = (
        select(
            Message.conversation_id,
            func.max(Message.msg_id).label("max_msg_id")
        )
        .where(
            and_(
                Message.conversation_id.in_(conv_ids),
                ~exists().where(
                    and_(
                        DeletedMessage.msg_id == Message.msg_id,
                        DeletedMessage.user_id == user_id
                    )
                )
            )
        )
        .group_by(Message.conversation_id)
        .subquery()
    )

    last_msg_result = await db.execute(
        select(Message).join(
            last_msg_subquery,
            Message.msg_id == last_msg_subquery.c.max_msg_id
        )
    )
    return {m.conversation_id: m for m in last_msg_result.scalars().all()}


async def _get_unread_counts(
    db: AsyncSession,
    conv_ids: list[int],
    user_id: int,
    conversations: dict[int, Conversation]  # 新增参数
) -> dict[int, int]:
    """批量获取未读消息数"""
    # 先获取所有会话的 read_msg_id 和 role
    member_result = await db.execute(
        select(
            ConversationMember.conversation_id,
            ConversationMember.read_msg_id,
            ConversationMember.role  # 新增获取 role
        ).where(
            and_(
                ConversationMember.conversation_id.in_(conv_ids),
                ConversationMember.user_id == user_id
            )
        )
    )
    member_rows = member_result.all()
    read_map = {row[0]: row[1] for row in member_rows}
    role_map = {row[0]: row[2] for row in member_rows}  # 新增 role_map

    # 批量查询未读数
    unread_counts = {}
    for conv_id in conv_ids:
        conv = conversations.get(conv_id)
        if (
            conv
            and conv.type == "group"
            and role_map.get(conv_id) not in ACTIVE_GROUP_ROLES
        ):
            unread_counts[conv_id] = 0
            continue
        read_id = read_map.get(conv_id, 0)
        count_result = await db.execute(
            select(func.count(Message.msg_id))  # pylint: disable=not-callable
            .where(
                and_(
                    Message.conversation_id == conv_id,
                    Message.msg_id > read_id,
                    Message.sender_id != user_id
                )
            )
        )
        unread_counts[conv_id] = count_result.scalar() or 0

    return unread_counts


async def _get_private_chat_partners(
    db: AsyncSession,
    conv_ids: list[int],
    user_id: int
) -> dict[int, dict]:
    """批量获取私聊会话的对方用户信息"""
    # 先找出所有私聊会话
    conv_result = await db.execute(
        select(Conversation.conversation_id, Conversation.type)
        .where(Conversation.conversation_id.in_(conv_ids))
    )

    private_conv_ids = [
        cid for cid, conv_type in conv_result.all()
        if conv_type == "private"
    ]

    if not private_conv_ids:
        return {}

    # 批量获取私聊会话的对方成员
    members_result = await db.execute(
        select(
            ConversationMember.conversation_id,
            ConversationMember.user_id
        ).where(
            and_(
                ConversationMember.conversation_id.in_(private_conv_ids),
                ConversationMember.user_id != user_id
            )
        )
    )

    # 收集对方 user_id
    member_rows = members_result.all()
    partner_ids = {row.user_id for row in member_rows}

    # 批量获取用户信息
    users_result = await db.execute(
        select(User.user_id, User.nickname, User.username, User.avatar_url)
        .where(User.user_id.in_(partner_ids))
    )
    user_map = {
        u.user_id: {
            "display_name": u.nickname or u.username,
            "avatar_url": u.avatar_url
        }
        for u in users_result.all()
    }

    # 组装结果
    result = {}
    for row in member_rows:
        conv_id = row.conversation_id
        partner_id = row.user_id
        if partner_id in user_map:
            result[conv_id] = user_map[partner_id]

    return result


async def _get_user_conversation_members(
    db: AsyncSession,
    user_id: int
) -> tuple[list, list]:
    """获取用户的会话成员信息，返回(member_rows, conversation_ids)"""
    member_rows = (await db.execute(
        select(
            ConversationMember.conversation_id,
            ConversationMember.read_msg_id,
            ConversationMember.is_pinned,
            ConversationMember.do_not_disturb,
            ConversationMember.role,
            ConversationMember.is_hidden
        ).where(ConversationMember.user_id == user_id)
    )).all()

    conv_ids = [row.conversation_id for row in member_rows]
    return member_rows, conv_ids


async def _build_conversation_responses(
    conv_ids: list[int],
    member_rows: list,
    conversations: dict[int, Conversation],
    last_messages: dict[int, Message],
    unread_counts: dict[int, int],
    private_avatars: dict[int, dict],
    user_id: int,
    db: AsyncSession
) -> list[ConversationResponse]:
    """构建响应对象"""
    read_map = {row.conversation_id: row.read_msg_id for row in member_rows}
    pinned_map = {row.conversation_id: row.is_pinned for row in member_rows}
    dnd_map = {row.conversation_id: row.do_not_disturb for row in member_rows}
    role_map = {row.conversation_id: row.role for row in member_rows}
    hidden_map = {row.conversation_id: row.is_hidden for row in member_rows}

    result = []
    for conv_id in conv_ids:
        conv = conversations.get(conv_id)
        if not conv:
            continue

        last_msg = last_messages.get(conv_id)

        if (
            conv.type == "group"
            and role_map.get(conv_id) not in ACTIVE_GROUP_ROLES
        ):
            frozen_result = await db.execute(
                select(Message).where(
                    and_(
                        Message.conversation_id == conv_id,
                        Message.msg_id <= read_map.get(conv_id, 0),
                        ~exists().where(
                            and_(
                                DeletedMessage.msg_id == Message.msg_id,
                                DeletedMessage.user_id == user_id
                            )
                        )
                    )
                ).order_by(Message.msg_id.desc()).limit(1)
            )
            last_msg = frozen_result.scalar_one_or_none()

        display_name = conv.conversation_name
        avatar_url = None

        if conv.type == "private" and conv_id in private_avatars:
            display_name = private_avatars[conv_id]["display_name"]
            avatar_url = private_avatars[conv_id]["avatar_url"]

        result.append(ConversationResponse(
            conversation_id=conv_id,
            conversation_name=display_name,
            type=conv.type,
            avatar_url=avatar_url,
            last_message=last_msg.content if last_msg else None,
            last_message_time=(
                last_msg.created_at if last_msg else conv.created_at
            ),
            unread_count=unread_counts.get(conv_id, 0),
            created_at=conv.created_at,
            is_pinned=pinned_map.get(conv_id, False),
            do_not_disturb=dnd_map.get(conv_id, False),
            role=role_map.get(conv_id, "member"),
            is_hidden=hidden_map.get(conv_id, False)
        ))

    # 排序：置顶优先，然后按最后消息时间倒序
    result.sort(
        key=lambda x: (
            not x.is_pinned,
            -(x.last_message_time.timestamp() if x.last_message_time else 0)
        )
    )
    return result


@router.get(
    "/{conversation_id}/messages",
    response_model=list[MessageResponse]
)
async def get_messages(
    conversation_id: int,
    limit: int = 50,
    before_msg_id: Optional[int] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    sender_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取会话的历史消息(分页)"""
    user_id = current_user["user_id"]

    member_result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id
            )
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="无权访问该会话")
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.conversation_id == conversation_id
        )
    )
    conversation = conv_result.scalar_one_or_none()
    conditions = [
        Message.conversation_id == conversation_id,
        ~exists().where(
            and_(
                DeletedMessage.msg_id == Message.msg_id,
                DeletedMessage.user_id == user_id
            )
        )
    ]
    if (
        conversation
        and conversation.type == "group"
        and member.role not in ACTIVE_GROUP_ROLES
    ):
        conditions.append(Message.msg_id <= member.read_msg_id)
    if before_msg_id:
        conditions.append(Message.msg_id < before_msg_id)
    if start_time:
        conditions.append(Message.created_at >= start_time)
    if end_time:
        conditions.append(Message.created_at <= end_time)
    if sender_id is not None:
        conditions.append(Message.sender_id == sender_id)

    reply_count_subq = (
        select(
            Message.reply_to,
            func.count(1).label("reply_count")  # pylint: disable=not-callable
        )
        .where(Message.reply_to.isnot(None))
        .group_by(Message.reply_to)
        .subquery()
    )

    query = (
        select(Message, User, reply_count_subq.c.reply_count)
        .join(User, Message.sender_id == User.user_id)
        .outerjoin(
            reply_count_subq,
            Message.msg_id == reply_count_subq.c.reply_to
        )
        .where(and_(*conditions))
        .order_by(Message.msg_id.desc())
        .limit(limit)
    )

    result = await db.execute(query)
    rows = result.all()

    if not rows:
        return []

    messages = []
    for msg, sender, reply_count in reversed(rows):
        messages.append(MessageResponse(
            msg_id=msg.msg_id,
            conversation_id=msg.conversation_id,
            sender_id=msg.sender_id,
            sender_name=sender.nickname or sender.username,
            sender_avatar=sender.avatar_url,
            content=msg.content,
            msg_type=msg.msg_type,
            created_at=msg.created_at,
            is_self=(msg.sender_id == user_id),
            reply_to=msg.reply_to,
            reply_count=reply_count or 0
        ))

    return messages


@router.put("/{conversation_id}/read")
async def mark_as_read(
    conversation_id: int,
    request: MarkReadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """标记会话中的消息为已读"""
    user_id = current_user["user_id"]
    member_result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id
            )
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="无权访问该会话")

    if member.role not in ACTIVE_GROUP_ROLES:
        conv_result = await db.execute(
            select(Conversation).where(
                Conversation.conversation_id == conversation_id
            )
        )
        conversation = conv_result.scalar_one_or_none()
        if conversation and conversation.type == "group":
            raise HTTPException(status_code=403, detail="您已被移出群聊")
    await db.execute(
        update(ConversationMember)
        .where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id
            )
        )
        .values(read_msg_id=request.last_read_msg_id)
    )
    await db.commit()

    return {"message": "已更新阅读位置"}


@router.post("/create", response_model=CreateConversationResponse)
async def create_conversation(
    request: CreateConversationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """创建新会话"""
    user_id = current_user["user_id"]

    if request.type == "private":
        return await _create_private_conversation(request, db, user_id)
    if request.type == "group":
        return await _create_group_conversation(request, db, user_id)
    raise HTTPException(
        status_code=400,
        detail="不支持的会话类型"
    )

# 拆出来的私有方法


async def _create_private_conversation(request, db, user_id):
    if not request.target_user_id:
        raise HTTPException(status_code=400, detail="私聊需要指定目标用户")
    if request.target_user_id == user_id:
        raise HTTPException(status_code=400, detail="不能与自己创建会话")

    status = await get_friendship_status(
        db,
        user_id,
        request.target_user_id
    )
    if status != "accepted":
        raise HTTPException(
            status_code=400,
            detail="只能与好友创建私聊"
        )

    existing_conv = await find_private_conversation(
        db, user_id, request.target_user_id
    )
    if existing_conv:
        return CreateConversationResponse(
            conversation_id=existing_conv.conversation_id,
            type="private",
            conversation_name=None,
            is_new=False
        )

    conversation = Conversation(
        type="private",
        created_at=datetime.now(ZoneInfo(SHANGHAI))
    )
    db.add(conversation)
    await db.flush()

    member1 = ConversationMember(
        conversation_id=conversation.conversation_id,
        user_id=user_id,
        joined_at=datetime.now(ZoneInfo(SHANGHAI)),
        role="member"
    )
    member2 = ConversationMember(
        conversation_id=conversation.conversation_id,
        user_id=request.target_user_id,
        joined_at=datetime.now(ZoneInfo(SHANGHAI)),
        role="member"
    )
    db.add_all([member1, member2])
    await db.commit()

    # ========== 推送私聊通知给目标用户 ==========
    sender_result = await db.execute(
        select(User).where(User.user_id == user_id)
    )
    sender = sender_result.scalar_one_or_none()

    push_data = {
        "type": "new_conversation",
        "data": {
            "conversation_id": conversation.conversation_id,
            "conversation_name": None,
            "type": "private",
            "creator_id": user_id,
            "creator_name": (
                sender.nickname or sender.username
            ),
        }
    }
    await manager.send_personal_message(push_data, request.target_user_id)

    return CreateConversationResponse(
        conversation_id=conversation.conversation_id,
        type="private",
        conversation_name=None,
        is_new=True
    )


async def _create_group_conversation(request, db, user_id):
    if not request.member_ids or len(request.member_ids) == 0:
        raise HTTPException(
            status_code=400,
            detail="群聊需要至少邀请一位成员"
        )
    if not request.group_name:
        raise HTTPException(
            status_code=400,
            detail="群聊需要设置群名称"
        )

    member_ids = list(dict.fromkeys(request.member_ids))
    if user_id in member_ids:
        member_ids.remove(user_id)

    if not member_ids:
        raise HTTPException(
            status_code=400,
            detail="群聊需要至少邀请一位其他成员"
        )

    status_map = await get_batch_friendship_status(db, user_id, member_ids)
    for mid in member_ids:
        if status_map.get(mid) != "accepted":
            raise HTTPException(
                status_code=400,
                detail=f"用户 {mid} 不是您的好友"
            )
    users_result = await db.execute(
        select(User.user_id, User.is_active).where(
            User.user_id.in_(member_ids)
        )
    )
    user_active_map = {u.user_id: u.is_active for u in users_result.all()}
    inactive_ids = [uid for uid in member_ids if not user_active_map.get(uid)]
    if inactive_ids:
        raise HTTPException(
            status_code=400,
            detail=f"用户 {inactive_ids[0]} 已注销"
        )
    conversation = Conversation(
        conversation_name=request.group_name,
        type="group",
        created_at=datetime.now(ZoneInfo(SHANGHAI))
    )
    db.add(conversation)
    await db.flush()

    members = [
        ConversationMember(
            conversation_id=conversation.conversation_id,
            user_id=user_id,
            joined_at=datetime.now(ZoneInfo(SHANGHAI)),
            role="owner"
        )
    ]
    members.extend([
        ConversationMember(
            conversation_id=conversation.conversation_id,
            user_id=uid,
            joined_at=datetime.now(ZoneInfo(SHANGHAI)),
            role="member"
        )
        for uid in member_ids
    ])
    db.add_all(members)

    # 发送系统消息
    system_msg = Message(
        conversation_id=conversation.conversation_id,
        sender_id=user_id,  # 由群聊创建者发出
        content="群聊创建成功，现在可以开始聊天了！",
        msg_type="system"
    )
    db.add(system_msg)
    await db.commit()

    # ========== 推送给所有在线成员 ==========
    sender_result = await db.execute(
        select(User).where(User.user_id == user_id)
    )
    sender = sender_result.scalar_one_or_none()

    push_data = {
        "type": "new_conversation",
        "data": {
            "conversation_id": conversation.conversation_id,
            "conversation_name": request.group_name,
            "type": "group",
            "creator_id": user_id,
            "creator_name": (
                sender.nickname or sender.username
            ),
        }
    }

    for member in members:
        if member.user_id != user_id:
            await manager.send_personal_message(push_data, member.user_id)

    return CreateConversationResponse(
        conversation_id=conversation.conversation_id,
        type="group",
        conversation_name=request.group_name,
        is_new=True
    )
