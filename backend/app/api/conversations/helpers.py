from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Conversation, ConversationMember

ACTIVE_GROUP_ROLES = ("owner", "admin", "member")


async def find_private_conversation(
    db: AsyncSession,
    user_id: int,
    target_id: int
) -> Optional[Conversation]:
    """查找两个用户之间的私聊会话"""
    subquery = (
        select(ConversationMember.conversation_id)
        .join(Conversation)
        .where(
            and_(
                ConversationMember.user_id == user_id,
                Conversation.type == "private"
            )
        )
        .subquery()
    )

    result = await db.execute(
        select(Conversation)
        .join(ConversationMember)
        .where(
            and_(
                ConversationMember.conversation_id.in_(select(subquery)),
                ConversationMember.user_id == target_id
            )
        )
    )
    return result.scalar_one_or_none()


async def get_group_conversation_member(
    db: AsyncSession,
    conversation_id: int,
    user_id: int,
    allow_removed: bool = False
) -> tuple[Conversation, ConversationMember]:
    """获取群聊和当前用户成员信息，不满足条件抛异常"""
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.conversation_id == conversation_id
        )
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="会话不存在")
    if conversation.type != "group":
        raise HTTPException(status_code=400, detail="该会话不是群聊")

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
        raise HTTPException(status_code=403, detail="不在该群聊中")
    if not allow_removed and member.role not in ACTIVE_GROUP_ROLES:
        raise HTTPException(status_code=403, detail="您已被移出群聊")
    return conversation, member


async def get_group_member_by_user_id(
    db: AsyncSession,
    conversation_id: int,
    user_id: int,
    include_removed: bool = False
) -> ConversationMember | None:
    """按 user_id 获取群成员"""
    conditions = [
        ConversationMember.conversation_id == conversation_id,
        ConversationMember.user_id == user_id
    ]
    if not include_removed:
        conditions.append(ConversationMember.role.in_(ACTIVE_GROUP_ROLES))
    result = await db.execute(
        select(ConversationMember).where(and_(*conditions))
    )
    return result.scalar_one_or_none()
