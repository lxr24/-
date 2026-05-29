from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, exists, select, update
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.message import (
    ConversationMember,
    DeletedMessage,
    Message,
)
from app.schemas.message import UpdateConversationSettingsRequest


NO_AUTH = "无权访问该会话"

router = APIRouter()


@router.delete("/{conversation_id}/messages/{msg_id}")
async def delete_message(
    conversation_id: int,
    msg_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """删除单条消息(软删除，仅自己不可见)"""
    user_id = current_user["user_id"]

    member_result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id
            )
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail=NO_AUTH)

    msg_result = await db.execute(
        select(Message).where(
            and_(
                Message.msg_id == msg_id,
                Message.conversation_id == conversation_id
            )
        )
    )
    if not msg_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="消息不存在")

    existing = await db.execute(
        select(DeletedMessage).where(
            and_(
                DeletedMessage.user_id == user_id,
                DeletedMessage.msg_id == msg_id
            )
        )
    )
    if existing.scalar_one_or_none():
        return {"message": "消息已删除"}

    deleted = DeletedMessage(user_id=user_id, msg_id=msg_id)
    db.add(deleted)
    await db.commit()

    return {"message": "消息已删除"}


@router.delete("/{conversation_id}/messages")
async def clear_conversation_messages(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """清空会话的所有聊天记录(软删除)"""
    user_id = current_user["user_id"]

    member_result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id
            )
        )
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail=NO_AUTH)

    msg_result = await db.execute(
        select(Message.msg_id).where(
            and_(
                Message.conversation_id == conversation_id,
                ~exists().where(
                    and_(
                        DeletedMessage.msg_id == Message.msg_id,
                        DeletedMessage.user_id == user_id
                    )
                )
            )
        )
    )
    msg_ids = [row[0] for row in msg_result.all()]

    if not msg_ids:
        return {"message": "没有需要删除的消息"}

    await db.execute(
        insert(DeletedMessage).values(
            [{"user_id": user_id, "msg_id": mid} for mid in msg_ids]
        )
    )
    await db.commit()

    return {"message": f"已清空 {len(msg_ids)} 条消息"}


@router.patch("/{conversation_id}/settings")
async def update_conversation_settings(
    conversation_id: int,
    request: UpdateConversationSettingsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """更新会话的置顶/免打扰状态"""
    user_id = current_user["user_id"]

    member = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id
            )
        )
    )
    member = member.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail=NO_AUTH)

    update_data = {}
    if request.is_pinned is not None:
        update_data["is_pinned"] = request.is_pinned
    if request.do_not_disturb is not None:
        update_data["do_not_disturb"] = request.do_not_disturb

    if update_data:
        await db.execute(
            update(ConversationMember)
            .where(
                and_(
                    ConversationMember.conversation_id == conversation_id,
                    ConversationMember.user_id == user_id
                )
            )
            .values(**update_data)
        )
        await db.commit()

    return {"message": "设置已更新"}


@router.delete("/{conversation_id}")
async def delete_conversation_window(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    删除聊天窗口（仅将窗口从消息列表隐藏，绝不清空聊天记录，不退群，不删好友）
    """
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

    member.is_hidden = True

    await db.commit()
    return {"message": "聊天窗口已删除"}
