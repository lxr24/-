from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.dependencies import get_current_user
from app.api.websocket import manager
from app.db.database import get_db
from app.models.group import GroupAnnouncement, GroupInvitation
from app.models.message import (
    Conversation,
    ConversationMember,
    Message
)
from app.models.user_management import User, get_batch_friendship_status
from app.schemas.group import (
    CreateGroupAnnouncementRequest,
    CreateGroupAnnouncementResponse,
    GroupInfoResponse,
    GroupAnnouncementInfo,
    GroupInviteInfo,
    GroupInviteRequest,
    GroupInviteResponse,
    GroupInviteReviewRequest,
    GroupMemberInfo,
    UpdateMemberRoleRequest,
)
from .helpers import (
    ACTIVE_GROUP_ROLES,
    get_group_conversation_member,
    get_group_member_by_user_id
)


SHANGHAI = "Asia/Shanghai"
NO_CHANGE = "角色未发生变化"

router = APIRouter()


@router.get("/{conversation_id}/group-info", response_model=GroupInfoResponse)
async def get_group_info(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取群聊基本信息：名称、成员、历史公告"""
    user_id = current_user["user_id"]
    conversation, _ = await get_group_conversation_member(
        db, conversation_id, user_id, allow_removed=True
    )

    members_result = await db.execute(
        select(ConversationMember, User)
        .join(User, ConversationMember.user_id == User.user_id)
        .where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role.in_(ACTIVE_GROUP_ROLES)
            )
        )
        .order_by(ConversationMember.joined_at.asc())
    )
    members = [
        GroupMemberInfo(
            user_id=user.user_id,
            username=user.username,
            nickname=user.nickname,
            avatar_url=user.avatar_url,
            role=member.role,
            joined_at=member.joined_at
        )
        for member, user in members_result.all()
    ]

    ann_result = await db.execute(
        select(GroupAnnouncement, User)
        .join(User, GroupAnnouncement.creator_id == User.user_id)
        .where(GroupAnnouncement.conversation_id == conversation_id)
        .order_by(GroupAnnouncement.created_at.desc())
    )
    announcements = [
        GroupAnnouncementInfo(
            announcement_id=ann.announcement_id,
            content=ann.content,
            creator_id=ann.creator_id,
            creator_name=user.nickname or user.username,
            created_at=ann.created_at
        )
        for ann, user in ann_result.all()
    ]

    return GroupInfoResponse(
        conversation_id=conversation.conversation_id,
        conversation_name=conversation.conversation_name,
        members=members,
        announcements=announcements
    )


@router.get(
    "/{conversation_id}/announcements",
    response_model=list[GroupAnnouncementInfo]
)
async def list_group_announcements(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取群公告列表"""
    user_id = current_user["user_id"]
    await get_group_conversation_member(
        db, conversation_id, user_id, allow_removed=True
    )

    ann_result = await db.execute(
        select(GroupAnnouncement, User)
        .join(User, GroupAnnouncement.creator_id == User.user_id)
        .where(GroupAnnouncement.conversation_id == conversation_id)
        .order_by(GroupAnnouncement.created_at.desc())
    )

    return [
        GroupAnnouncementInfo(
            announcement_id=ann.announcement_id,
            content=ann.content,
            creator_id=ann.creator_id,
            creator_name=user.nickname or user.username,
            created_at=ann.created_at
        )
        for ann, user in ann_result.all()
    ]


@router.post(
    "/{conversation_id}/announcements",
    response_model=CreateGroupAnnouncementResponse
)
async def create_group_announcement(
    conversation_id: int,
    request: CreateGroupAnnouncementRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """发布群公告（仅群主/管理员）"""
    user_id = current_user["user_id"]
    _, current_member = await get_group_conversation_member(
        db, conversation_id, user_id
    )

    if current_member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="无权限发布群公告")

    content = request.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="公告内容不能为空")

    announcement = GroupAnnouncement(
        conversation_id=conversation_id,
        creator_id=user_id,
        content=content,
        created_at=datetime.now(ZoneInfo(SHANGHAI))
    )
    db.add(announcement)
    await db.commit()
    await db.refresh(announcement)

    creator_result = await db.execute(
        select(User).where(User.user_id == user_id)
    )
    creator = creator_result.scalar_one_or_none()
    creator_name = (creator.nickname or creator.username
                    if creator else None)
    await _push_group_announcement(
        conversation_id,
        announcement,
        creator_name,
        user_id,
        db
    )

    return CreateGroupAnnouncementResponse(
        announcement_id=announcement.announcement_id,
        created_at=announcement.created_at
    )


async def _push_group_announcement(
    conversation_id: int,
    announcement: GroupAnnouncement,
    creator_name: str | None,
    sender_id: int,
    db: AsyncSession
):
    member_result = await db.execute(
        select(ConversationMember.user_id).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role.in_(ACTIVE_GROUP_ROLES)
            )
        )
    )
    member_ids = [
        row[0]
        for row in member_result.all()
        if row[0] != sender_id
    ]
    if not member_ids:
        return

    users_result = await db.execute(
        select(User.user_id, User.is_active).where(
            User.user_id.in_(member_ids)
        )
    )
    active_member_ids = [
        user.user_id for user in users_result.all() if user.is_active
    ]
    if not active_member_ids:
        return

    push_data = {
        "type": "group_announcement",
        "data": {
            "conversation_id": conversation_id,
            "announcement": {
                "announcement_id": announcement.announcement_id,
                "content": announcement.content,
                "creator_id": announcement.creator_id,
                "creator_name": creator_name,
                "created_at": announcement.created_at.isoformat()
            }
        }
    }

    for member_id in active_member_ids:
        await manager.send_personal_message(push_data, member_id)


@router.patch("/{conversation_id}/members/{target_user_id}/role")
async def update_group_member_role(
    conversation_id: int,
    target_user_id: int,
    request: UpdateMemberRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """修改群成员角色（仅群主）"""
    user_id = current_user["user_id"]
    _, current_member = await get_group_conversation_member(
        db, conversation_id, user_id
    )
    if current_member.role != "owner":
        raise HTTPException(status_code=403, detail="仅群主可修改成员角色")

    target_member = await get_group_member_by_user_id(
        db, conversation_id, target_user_id
    )
    if not target_member:
        raise HTTPException(status_code=404, detail="目标成员不存在")

    if request.role == "owner":
        if target_user_id == user_id:
            return {"message": NO_CHANGE}
        if target_member.role == "owner":
            return {"message": NO_CHANGE}
        current_member.role = "member"
        target_member.role = "owner"
        # 推送群主转让通知
        conv_result = await db.execute(
            select(Conversation).where(
                Conversation.conversation_id == conversation_id
            )
        )
        conversation = conv_result.scalar_one_or_none()

        push_data = {
            "type": "role_changed",
            "data": {
                "conversation_id": conversation_id,
                "conversation_name": (
                    conversation.conversation_name
                    if conversation
                    else None
                ),
                "type": "group",
                "new_owner_id": target_user_id,
            }
        }

        # 推送给所有在线成员
        member_result = await db.execute(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == conversation_id
            )
        )
        for (member_id,) in member_result.all():
            await manager.send_personal_message(push_data, member_id)

        await db.commit()
        return {"message": "群主已转让"}

    if target_member.role == "owner":
        raise HTTPException(status_code=400, detail="不能直接修改群主角色")

    if target_member.role == request.role:
        return {"message": NO_CHANGE}

    target_member.role = request.role

    # 推送角色变更通知
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.conversation_id == conversation_id
        )
    )
    conversation = conv_result.scalar_one_or_none()

    push_data = {
        "type": "role_changed",
        "data": {
            "conversation_id": conversation_id,
            "conversation_name": (
                conversation.conversation_name
                if conversation
                else None
            ),
            "type": "group",
            "target_user_id": target_user_id,
            "new_role": request.role,
        }
    }

    member_result = await db.execute(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id
        )
    )
    for (member_id,) in member_result.all():
        await manager.send_personal_message(push_data, member_id)

    await db.commit()
    return {"message": "成员角色已更新"}


@router.delete("/{conversation_id}/members/{target_user_id}")
async def remove_group_member(
    conversation_id: int,
    target_user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """移除群成员（群主/管理员）"""
    user_id = current_user["user_id"]
    _, current_member = await get_group_conversation_member(
        db, conversation_id, user_id
    )
    if current_member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="无权限移除成员")

    target_member = await get_group_member_by_user_id(
        db, conversation_id, target_user_id
    )
    if not target_member:
        raise HTTPException(status_code=404, detail="目标成员不存在")

    if current_member.role == "owner":
        if target_user_id == user_id:
            raise HTTPException(status_code=400, detail="群主不能移除自己")
    else:
        if target_member.role in ("owner", "admin"):
            raise HTTPException(
                status_code=403,
                detail="群管理员仅可移除普通成员"
            )
    users_result = await db.execute(
        select(User).where(User.user_id.in_([user_id, target_user_id]))
    )
    users = {u.user_id: u for u in users_result.scalars().all()}
    admin_user = users.get(user_id)
    target_user = users.get(target_user_id)
    admin_name = (
        admin_user.nickname or admin_user.username
        if admin_user
        else "管理员"
    )
    target_name = (
        target_user.nickname or target_user.username
        if target_user
        else "成员"
    )
    system_content = f"{admin_name} 将 {target_name} 移出了群聊"
    system_msg = Message(
        conversation_id=conversation_id,
        sender_id=user_id,
        content=system_content,
        msg_type="system"
    )
    db.add(system_msg)
    await db.flush()

    target_member.read_msg_id = system_msg.msg_id
    target_member.role = "kicked"
    await db.commit()
    push_data = {
        "type": "new_message",
        "data": {
            "msg_id": system_msg.msg_id,
            "conversation_id": conversation_id,
            "sender_id": user_id,
            "sender_name": admin_name,
            "sender_avatar": admin_user.avatar_url if admin_user else None,
            "content": system_content,
            "msg_type": "system",
            "created_at": system_msg.created_at.isoformat(),
            "reply_to": None
        }
    }
    member_result = await db.execute(
        select(ConversationMember.user_id).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role.in_(ACTIVE_GROUP_ROLES)
            )
        )
    )
    member_ids = [row[0] for row in member_result.all()]  # 转成 list

    for member_id in member_ids:
        await manager.send_personal_message(push_data, member_id)

    await manager.send_personal_message(
        {
            "type": "MEMBER_REMOVED",
            "data": {
                "conversation_id": conversation_id,
                "reason": "kicked_by_admin"
            }
        },
        target_user_id
    )

    # 推送 member_change 给剩余活跃成员
    for member_id in member_ids:
        await manager.send_personal_message(
            {
                "type": "member_change",
                "data": {
                    "conversation_id": conversation_id
                }
            },
            member_id
        )

    return {"message": "成员已移除，已设置为只读"}


@router.post("/{conversation_id}/invites", response_model=GroupInviteResponse)
async def create_group_invites(
    conversation_id: int,
    request: GroupInviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """群成员邀请好友入群（待群主/管理员审核）"""
    user_id = current_user["user_id"]
    await get_group_conversation_member(db, conversation_id, user_id)

    invitee_ids = list(set(request.invitee_ids or []))
    if user_id in invitee_ids:
        invitee_ids.remove(user_id)
    if not invitee_ids:
        raise HTTPException(status_code=400, detail="至少需要邀请一位好友")

    status_map = await get_batch_friendship_status(db, user_id, invitee_ids)
    not_friend_ids = [
        uid for uid in invitee_ids
        if status_map.get(uid) != "accepted"
    ]
    if not_friend_ids:
        raise HTTPException(
            status_code=400,
            detail=f"用户 {not_friend_ids[0]} 不是您的好友"
        )

    users_result = await db.execute(
        select(User.user_id, User.is_active).where(
            User.user_id.in_(invitee_ids)
        )
    )
    user_active_map = {u.user_id: u.is_active for u in users_result.all()}
    inactive_ids = [uid for uid in invitee_ids if not user_active_map.get(uid)]
    if inactive_ids:
        raise HTTPException(
            status_code=400,
            detail=f"用户 {inactive_ids[0]} 已注销"
        )
    member_rows = await db.execute(
        select(ConversationMember.user_id).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id.in_(invitee_ids),
                ConversationMember.role.in_(ACTIVE_GROUP_ROLES)
            )
        )
    )
    existing_member_ids = {row[0] for row in member_rows.all()}
    if existing_member_ids:
        raise HTTPException(
            status_code=400,
            detail=f"用户 {next(iter(existing_member_ids))} 已在群聊中"
        )

    pending_rows = await db.execute(
        select(GroupInvitation.invitee_id).where(
            and_(
                GroupInvitation.conversation_id == conversation_id,
                GroupInvitation.invitee_id.in_(invitee_ids),
                GroupInvitation.status == "pending"
            )
        )
    )
    pending_invitee_ids = {row[0] for row in pending_rows.all()}
    if pending_invitee_ids:
        raise HTTPException(
            status_code=400,
            detail=f"用户 {next(iter(pending_invitee_ids))} 已有待审核邀请"
        )

    now = datetime.now(ZoneInfo(SHANGHAI))
    invitations = [
        GroupInvitation(
            conversation_id=conversation_id,
            inviter_id=user_id,
            invitee_id=invitee_id,
            status="pending",
            created_at=now
        )
        for invitee_id in invitee_ids
    ]
    db.add_all(invitations)
    await db.commit()
    for inv in invitations:
        await db.refresh(inv)

    return GroupInviteResponse(
        invitation_ids=[inv.invitation_id for inv in invitations]
    )


@router.get("/{conversation_id}/invites", response_model=list[GroupInviteInfo])
async def list_group_invites(
    conversation_id: int,
    status: str = "pending",
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取群邀请列表（默认仅待审核）"""
    user_id = current_user["user_id"]
    _, current_member = await get_group_conversation_member(
        db, conversation_id, user_id
    )
    if current_member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="无权限查看邀请列表")

    valid_status = {"pending", "approved", "rejected", "all"}
    if status not in valid_status:
        raise HTTPException(status_code=400, detail="无效的邀请状态")

    conditions = [GroupInvitation.conversation_id == conversation_id]
    if status != "all":
        conditions.append(GroupInvitation.status == status)

    inviter_user = aliased(User)
    invitee_user = aliased(User)
    result = await db.execute(
        select(GroupInvitation, inviter_user, invitee_user)
        .join(inviter_user, GroupInvitation.inviter_id == inviter_user.user_id)
        .join(invitee_user, GroupInvitation.invitee_id == invitee_user.user_id)
        .where(and_(*conditions))
        .order_by(GroupInvitation.created_at.desc())
    )

    return [
        GroupInviteInfo(
            invitation_id=inv.invitation_id,
            inviter_id=inv.inviter_id,
            inviter_username=inviter.username,
            inviter_avatar_url=inviter.avatar_url,
            invitee_id=inv.invitee_id,
            invitee_username=invitee.username,
            invitee_avatar_url=invitee.avatar_url,
            status=inv.status,
            reviewer_id=inv.reviewer_id,
            created_at=inv.created_at,
            reviewed_at=inv.reviewed_at
        )
        for inv, inviter, invitee in result.all()
    ]


@router.put("/{conversation_id}/invites/{invitation_id}/review")
async def review_group_invite(
    conversation_id: int,
    invitation_id: int,
    request: GroupInviteReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """审核群邀请（仅群主/管理员）"""
    user_id = current_user["user_id"]
    _, current_member = await get_group_conversation_member(
        db, conversation_id, user_id
    )
    if current_member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="无权限审核邀请")

    inv_result = await db.execute(
        select(GroupInvitation).where(
            and_(
                GroupInvitation.invitation_id == invitation_id,
                GroupInvitation.conversation_id == conversation_id
            )
        )
    )
    invitation = inv_result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(status_code=404, detail="邀请不存在")
    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail="邀请已审核")

    if request.action == "approved":
        user_active_result = await db.execute(
            select(User.is_active).where(User.user_id == invitation.invitee_id)
        )
        user_active = user_active_result.scalar_one_or_none()
        if user_active is not True:
            raise HTTPException(status_code=400, detail="被邀请人已注销")

        # 1. 查找是否已经存在记录（包括已退群/被踢的记录）
        existing_member_result = await db.execute(
            select(ConversationMember).where(
                and_(
                    ConversationMember.conversation_id == conversation_id,
                    ConversationMember.user_id == invitation.invitee_id
                )
            )
        )
        existing_member = existing_member_result.scalar_one_or_none()

        if existing_member:
            # 如果存在记录，且角色是活跃的，说明已经在群里了
            if existing_member.role in ACTIVE_GROUP_ROLES:
                raise HTTPException(status_code=400, detail="被邀请人已在群聊中")
            # 核心修复：如果是曾经被踢/退群的成员，更新它的状态，而不是重新插入
            existing_member.role = "member"
            existing_member.joined_at = datetime.now(ZoneInfo(SHANGHAI))
        else:
            # 只有从没加过这个群的人，才真正插入一条新记录
            db.add(
                ConversationMember(
                    conversation_id=conversation_id,
                    user_id=invitation.invitee_id,
                    joined_at=datetime.now(ZoneInfo(SHANGHAI)),
                    role="member"
                )
            )

        # 推送新会话通知给被邀请者
        conv_result = await db.execute(
            select(Conversation).where(
                Conversation.conversation_id == conversation_id
            )
        )
        conversation = conv_result.scalar_one_or_none()

        push_data = {
            "type": "new_conversation",
            "data": {
                "conversation_id": conversation_id,
                "conversation_name": (
                    conversation.conversation_name
                    if conversation
                    else None
                ),
                "type": "group",
                "creator_id": user_id,
                "creator_name": None,
            }
        }
        await manager.send_personal_message(push_data, invitation.invitee_id)

    invitation.status = request.action
    invitation.reviewer_id = user_id
    invitation.reviewed_at = datetime.now(ZoneInfo(SHANGHAI))

    # 推送成员变更通知给所有群成员
    member_result = await db.execute(
        select(ConversationMember.user_id).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role.in_(ACTIVE_GROUP_ROLES)
            )
        )
    )
    for (member_id,) in member_result.all():
        await manager.send_personal_message(
            {
                "type": "member_change",
                "data": {
                    "conversation_id": conversation_id
                }
            },
            member_id
        )

    await db.commit()

    return {"message": "邀请已审核"}


@router.delete("/{conversation_id}/leave")
async def leave_group(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """成员退出群聊"""
    user_id = current_user["user_id"]
    _, current_member = await get_group_conversation_member(
        db, conversation_id, user_id
    )
    if current_member.role == "owner":
        raise HTTPException(status_code=400, detail="群主请先转让后再退出")

    last_msg_result = await db.execute(
        select(func.max(Message.msg_id)).where(
            Message.conversation_id == conversation_id
        )
    )
    current_member.read_msg_id = last_msg_result.scalar() or 0
    current_member.role = "quit"

    # 推送成员变更通知给所有活跃成员
    member_result = await db.execute(
        select(ConversationMember.user_id).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role.in_(ACTIVE_GROUP_ROLES)
            )
        )
    )
    for (member_id,) in member_result.all():
        await manager.send_personal_message(
            {
                "type": "member_change",
                "data": {
                    "conversation_id": conversation_id
                }
            },
            member_id
        )

    await db.commit()
    return {"message": "已退出群聊"}
