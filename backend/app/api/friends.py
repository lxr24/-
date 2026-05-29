from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, delete
from app.db.database import get_db
from app.models.user_management import (Friendship,
                                        User,
                                        FriendGroup,
                                        FriendGroupMember)
from app.models.message import (Conversation,
                                ConversationMember,
                                Message)
from app.core.dependencies import get_current_user
from app.models.user_management import (get_batch_friendship_status,
                                        get_friendship_status)

from app.schemas.friend import (FriendSearchResult,
                                FriendGroupResponse)
from app.api.websocket import manager


GROUP_NOT_EXIST = "分组不存在"

router = APIRouter(prefix="/friends", tags=["friends"])


@router.get("/search", response_model=list[FriendSearchResult])
async def search_users(
    keyword: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """搜索用户"""
    result = await db.execute(
        select(User)
        .where(
            (User.username.like(f"%{keyword}%")
             | User.nickname.like(f"%{keyword}%"))
            & User.is_active.is_(True)
        )
        .limit(20)
    )
    users = result.scalars().all()

    # 过滤掉自己
    users = [u for u in users if u.user_id != current_user["user_id"]]

    if not users:
        return []

    # 批量查询好友状态
    user_ids = [u.user_id for u in users]
    status_map = await get_batch_friendship_status(
        db,
        current_user["user_id"],
        user_ids
    )

    return [
        {
            "user_id": u.user_id,
            "username": u.username,
            "nickname": u.nickname,
            "avatar_url": u.avatar_url,
            "status": status_map.get(u.user_id)
        }
        for u in users
    ]


@router.post("/request/{friend_id}")
async def send_friend_request(
    friend_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """发送好友申请"""
    # 检查目标用户是否存在
    user_result = await db.execute(
        select(User).where(User.user_id == friend_id)
    )
    target_user = user_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if not target_user.is_active:
        raise HTTPException(status_code=400, detail="该用户已注销")

    # 不能添加自己
    if friend_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="不能添加自己为好友")

    # 检查现有关系状态
    existing_status = await get_friendship_status(
        db,
        current_user["user_id"],
        friend_id
    )

    if existing_status == "pending":
        # 需要判断是谁发送的
        result = await db.execute(
            select(Friendship).where(
                and_(
                    Friendship.user_id == current_user["user_id"],
                    Friendship.friend_id == friend_id
                )
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="已发送好友申请，请等待对方处理"
            )
        raise HTTPException(
            status_code=400,
            detail="对方已向你发送好友申请，请前往处理"
        )
    if existing_status == "accepted":
        raise HTTPException(status_code=400, detail="你们已经是好友了")
    if existing_status == "blocked":
        raise HTTPException(status_code=400, detail="对方已将你拉黑")

    # 创建新的好友申请
    friendship = Friendship(
        user_id=current_user["user_id"],
        friend_id=friend_id,
        status="pending"
    )
    db.add(friendship)
    await db.commit()
    return {"message": "好友请求已发送"}


@router.put("/accept/{request_id}")
async def accept_friend_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """同意好友申请"""
    result = await db.execute(
        select(Friendship).where(
            and_(
                Friendship.id == request_id,
                Friendship.friend_id == current_user["user_id"],
                Friendship.status == "pending",
            )
        )
    )
    friendship = result.scalar_one_or_none()
    if not friendship:
        raise HTTPException(status_code=404, detail="好友请求不存在")

    friendship.status = "accepted"

    # ===发送通过申请系统消息===
    user_id_a = friendship.user_id      # 发起申请的人
    user_id_b = friendship.friend_id    # 同意申请的人（当前用户）

    # 1. 查找是否已存在私聊会话
    subquery = (
        select(ConversationMember.conversation_id)
        .join(Conversation)
        .where(
            and_(
                ConversationMember.user_id == user_id_a,
                Conversation.type == "private"
            )
        )
        .subquery()
    )
    conv_result = await db.execute(
        select(Conversation)
        .join(ConversationMember)
        .where(
            and_(
                ConversationMember.conversation_id.in_(select(subquery)),
                ConversationMember.user_id == user_id_b
            )
        )
    )
    conversation = conv_result.scalar_one_or_none()

    # 2. 如果不存在，创建新私聊
    if not conversation:
        conversation = Conversation(type="private")
        db.add(conversation)
        await db.flush()

        member_a = ConversationMember(
            conversation_id=conversation.conversation_id,
            user_id=user_id_a
        )
        member_b = ConversationMember(
            conversation_id=conversation.conversation_id,
            user_id=user_id_b
        )
        db.add_all([member_a, member_b])

    # 3. 发送系统消息
    system_msg = Message(
        conversation_id=conversation.conversation_id,
        sender_id=user_id_b,  # 由同意者发出
        content="我通过了你的好友申请，现在可以开始聊天了！",
        msg_type="system"
    )
    db.add(system_msg)
    # =================
    await db.commit()

    # ========== 推送私聊通知给目标用户 ==========
    sender_result = await db.execute(
        select(User).where(User.user_id == user_id_b)
    )
    sender = sender_result.scalar_one_or_none()

    push_data = {
        "type": "new_conversation",
        "data": {
            "conversation_id": conversation.conversation_id,
            "conversation_name": None,
            "type": "private",
            "creator_id": user_id_b,
            "creator_name": (
                sender.nickname or sender.username
            ),
        }
    }
    await manager.send_personal_message(push_data, user_id_a)
    await manager.send_personal_message(push_data, user_id_b)

    return {"message": "已添加好友"}


async def _get_sent_friendships(
    db: AsyncSession, user_id: int, status_condition: list
):
    query = select(Friendship).where(
        and_(Friendship.user_id == user_id, *status_condition)
    )
    result = await db.execute(query)
    friendships = result.scalars().all()
    friend_ids = [f.friend_id for f in friendships]
    return friendships, friend_ids


async def _get_received_friendships(
    db: AsyncSession, user_id: int, status_condition: list
):
    query = select(Friendship).where(
        and_(Friendship.friend_id == user_id, *status_condition)
    )
    result = await db.execute(query)
    friendships = result.scalars().all()
    friend_ids = [f.user_id for f in friendships]
    return friendships, friend_ids


async def _get_all_friendships(
    db: AsyncSession, user_id: int, status_condition: list
):
    query = select(Friendship).where(
        and_(
            or_(
                Friendship.user_id == user_id,
                Friendship.friend_id == user_id
            ),
            *status_condition,
        )
    )
    result = await db.execute(query)
    friendships = result.scalars().all()
    friend_ids = [
        f.friend_id if f.user_id == user_id else f.user_id
        for f in friendships
    ]
    return friendships, friend_ids


@router.get("/list")
async def get_friends(
    status: str = "accepted",
    relation_type: str = Query("all", alias="type"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取好友列表
    - status: pending, accepted(default), blocked, all
    - type: sent, received, all(default)
    """
    # 验证 type 参数
    if relation_type not in ["sent", "received", "all"]:
        raise HTTPException(
            status_code=400,
            detail="type 必须是 sent, received 或 all"
        )
    # 验证 status 参数
    valid_statuses = ["pending", "accepted", "blocked", "all"]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"status 必须是 {', '.join(valid_statuses)} 之一"
        )

    friendships = []
    friend_ids = []

    # 构建状态条件
    status_condition = []
    if status != "all":
        status_condition.append(Friendship.status == status)

    if relation_type == "sent":
        # 我发送的好友请求
        friendships, friend_ids = await _get_sent_friendships(
            db, current_user["user_id"], status_condition
        )

    elif relation_type == "received":
        # 我收到的好友请求
        friendships, friend_ids = await _get_received_friendships(
            db, current_user["user_id"], status_condition
        )

    else:  # relation_type == "all"
        # 查询所有好友关系（双向）
        friendships, friend_ids = await _get_all_friendships(
            db, current_user["user_id"], status_condition
        )

    if not friendships or not friend_ids:
        return []

    # 查询用户信息
    users_result = await db.execute(
        select(User).where(
            and_(
                User.user_id.in_(friend_ids)
            )
        )
    )
    users = {u.user_id: u for u in users_result.scalars().all()}

    # 构建返回结果
    result_list = []
    for f, fid in zip(friendships, friend_ids):
        user = users.get(fid)
        if not user:
            continue

        result_list.append(
            {
                "friendship_id": f.id,
                "user_id": fid,
                "username": user.username,
                "nickname": user.nickname,
                "avatar_url": user.avatar_url,
                "status": f.status,
                "created_at": (
                    f.created_at.isoformat() if f.created_at else None
                )
            }
        )

    return result_list


@router.delete("/{friendship_id}")
async def remove_friendship(
    friendship_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """删除好友或拒绝好友申请
    - 如果是 pending 状态：拒绝申请
    - 如果是 accepted 状态：删除好友
    """
    # 查询好友关系
    result = await db.execute(
        select(Friendship).where(Friendship.id == friendship_id)
    )
    friendship = result.scalar_one_or_none()

    if not friendship:
        raise HTTPException(status_code=404, detail="好友关系不存在")

    # 验证权限：当前用户必须是关系中的一方
    if current_user["user_id"] not in (
        friendship.user_id, friendship.friend_id
    ):
        raise HTTPException(status_code=403, detail="无权操作此好友关系")

    # 删除
    if friendship.status == "accepted":
        # 确定两个用户的ID
        user_id1 = friendship.user_id
        user_id2 = friendship.friend_id

        # 删除 user_id1 的分组中包含 user_id2 的关联
        await db.execute(
            delete(FriendGroupMember).where(
                and_(
                    FriendGroupMember.friend_id == user_id2,
                    FriendGroupMember.group_id.in_(
                        select(FriendGroup.id).where(
                            FriendGroup.user_id == user_id1
                        )
                    )
                )
            )
        )

        # 删除 user_id2 的分组中包含 user_id1 的关联
        await db.execute(
            delete(FriendGroupMember).where(
                and_(
                    FriendGroupMember.friend_id == user_id1,
                    FriendGroupMember.group_id.in_(
                        select(FriendGroup.id).where(
                            FriendGroup.user_id == user_id2
                        )
                    )
                )
            )
        )

    await db.delete(friendship)
    await db.commit()

    action = "拒绝" if friendship.status == "pending" else "删除"
    return {"message": f"已{action}好友关系"}


@router.post("/groups", response_model=FriendGroupResponse)
async def create_friend_group(
    group_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """创建好友分组"""
    # 检查分组名是否已存在
    existing = await db.execute(
        select(FriendGroup).where(
            and_(
                FriendGroup.user_id == current_user["user_id"],
                FriendGroup.group_name == group_name
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="分组名称已存在")

    group = FriendGroup(
        user_id=current_user["user_id"],
        group_name=group_name
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)

    return FriendGroupResponse(
        id=group.id,
        group_name=group.group_name,
        created_at=(
            group.created_at.isoformat()
            if group.created_at
            else None
        )
    )


@router.get("/groups", response_model=list[FriendGroupResponse])
async def get_friend_groups(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取自己的好友分组列表"""
    result = await db.execute(
        select(FriendGroup)
        .where(FriendGroup.user_id == current_user["user_id"])
        .order_by(FriendGroup.created_at)
    )
    groups = result.scalars().all()

    return [
        FriendGroupResponse(
            id=g.id,
            group_name=g.group_name,
            created_at=(
                g.created_at.isoformat()
                if g.created_at
                else None
            )
        )
        for g in groups
    ]


@router.put("/groups/{group_id}")
async def update_friend_group(
    group_id: int,
    group_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """修改好友分组名称"""
    # 查询分组
    result = await db.execute(
        select(FriendGroup).where(
            and_(
                FriendGroup.id == group_id,
                FriendGroup.user_id == current_user["user_id"]
            )
        )
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail=GROUP_NOT_EXIST)

    # 检查新名称是否与其他分组冲突
    existing = await db.execute(
        select(FriendGroup).where(
            and_(
                FriendGroup.user_id == current_user["user_id"],
                FriendGroup.group_name == group_name,
                FriendGroup.id != group_id
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="分组名称已存在")

    group.group_name = group_name
    await db.commit()

    return {"message": "分组更新成功"}


@router.delete("/groups/{group_id}")
async def delete_friend_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """删除好友分组"""
    # 查询分组
    result = await db.execute(
        select(FriendGroup).where(
            and_(
                FriendGroup.id == group_id,
                FriendGroup.user_id == current_user["user_id"]
            )
        )
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail=GROUP_NOT_EXIST)

    # 删除分组（级联删除关联的成员关系）
    await db.delete(group)
    await db.commit()

    return {"message": "分组已删除"}


@router.post("/groups/{group_id}/members/{friend_id}")
async def add_friend_to_group(
    group_id: int,
    friend_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """将好友添加到分组"""
    # 验证分组属于当前用户
    group_result = await db.execute(
        select(FriendGroup).where(
            and_(
                FriendGroup.id == group_id,
                FriendGroup.user_id == current_user["user_id"]
            )
        )
    )
    if not group_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=GROUP_NOT_EXIST)

    # 验证是否为好友关系
    status = await get_friendship_status(
        db,
        current_user["user_id"],
        friend_id
    )
    if status != "accepted":
        raise HTTPException(status_code=400, detail="不是好友关系")

    # 检查是否已在分组中
    existing = await db.execute(
        select(FriendGroupMember).where(
            and_(
                FriendGroupMember.group_id == group_id,
                FriendGroupMember.friend_id == friend_id
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="好友已在该分组中")

    member = FriendGroupMember(group_id=group_id, friend_id=friend_id)
    db.add(member)
    await db.commit()
    return {"message": "已添加到分组"}


@router.delete("/groups/{group_id}/members/{friend_id}")
async def remove_friend_from_group(
    group_id: int,
    friend_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """将好友移出分组"""
    # 验证分组权限
    result = await db.execute(
        select(FriendGroupMember).join(FriendGroup).where(
            and_(
                FriendGroup.id == group_id,
                FriendGroup.user_id == current_user["user_id"],
                FriendGroupMember.friend_id == friend_id
            )
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="好友不在该分组中")

    await db.delete(member)
    await db.commit()
    return {"message": "已移出分组"}


@router.get("/groups/{group_id}/members")
async def get_group_members(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取分组内的好友列表"""
    # 验证分组权限
    group_result = await db.execute(
        select(FriendGroup).where(
            and_(
                FriendGroup.id == group_id,
                FriendGroup.user_id == current_user["user_id"]
            )
        )
    )
    if not group_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=GROUP_NOT_EXIST)

    # 查询分组内的好友
    result = await db.execute(
        select(User, FriendGroupMember).join(
            FriendGroupMember,
            User.user_id == FriendGroupMember.friend_id
        ).where(FriendGroupMember.group_id == group_id)
    )

    members = []
    for user, member in result:
        members.append({
            "user_id": user.user_id,
            "username": user.username,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
            "joined_at": (member.created_at.isoformat()
                          if member.created_at
                          else None)
        })

    return members
