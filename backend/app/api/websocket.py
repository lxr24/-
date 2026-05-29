from json import JSONDecodeError
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy import select, and_, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.exceptions import TokenExpiredError, TokenInvalidError
from app.db.database import get_db
from app.core.security import decode_access_token
from app.models.message import Message, Conversation, ConversationMember
from app.models.user_management import User, Friendship
from app.schemas.websocket import (ChatMessageData,
                                   ReadReceiptData,
                                   TypingStatusData,
                                   WebSocketMessage)
from app.utils.rate_limiter import WebSocketRateLimiter


router = APIRouter(prefix="/ws", tags=["websocket"])

ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "https://vox-frontend-mmje.app.spring26b.secoder.net",
    "https://Vox-frontend.mmje.secoder.local"
}  # 根据实际情况填写

rate_limiter = WebSocketRateLimiter(max_messages=15, window_seconds=1.0)
ACTIVE_GROUP_ROLES = ("owner", "admin", "member")


@router.websocket("/chat")
async def websocket_chat(    # pylint: disable=too-many-statements
    websocket: WebSocket,
    token: str,  # 客户端通过 query param 传递 token
    db: AsyncSession = Depends(get_db)
):
    # 连接前校验
    user_id = await _validate_websocket_connection(websocket, token)
    if user_id is None:
        return

    try:
        await manager.connect(user_id, websocket)

        # 连接后推送离线消息
        await push_offline_messages(user_id, db)

        # 消息循环
        await _handle_websocket_messages(websocket, user_id, db)

    except WebSocketDisconnect:
        manager.disconnect(user_id)
    # 异常兜底
    except Exception as e:     # pylint: disable=broad-exception-caught
        print(f"WebSocket error for user {user_id}: {str(e)}")
        manager.disconnect(user_id)


async def _validate_websocket_connection(
    websocket: WebSocket,
    token: str
) -> Optional[int]:
    """验证连接, 返回user_id, 失败返回None"""
    # Origin 校验
    origin = websocket.headers.get("origin")
    if not origin:
        await websocket.close(code=4003, reason="Missing origin")
        return None
    if origin not in ALLOWED_ORIGINS:
        await websocket.close(code=4003, reason="Origin not allowed")
        return None

    # Token 验证
    try:
        payload = decode_access_token(token)
    except (TokenInvalidError, TokenExpiredError, ValueError, TypeError):
        await websocket.close(code=1008, reason="Invalid token")
        return None

    return int(payload.get("sub"))


async def _handle_websocket_messages(
    websocket: WebSocket,
    user_id: int,
    db: AsyncSession
):
    """处理 WebSocket 消息循环"""
    while True:
        # 接收并解析 JSON
        data = await _receive_json_safely(websocket, user_id)
        if data is None:
            continue

        # 验证消息结构
        message = await _validate_message_structure(data, user_id)
        if message is None:
            continue

        # 路由到对应处理器
        await _route_message(message, user_id, db, websocket)


async def _receive_json_safely(
    websocket: WebSocket,
    user_id: int
) -> Optional[dict]:
    """安全接收JSON, 返回None表示失败"""
    try:
        return await websocket.receive_json()
    except JSONDecodeError:
        await manager.send_personal_message(
            {"type": "error", "data": {"message": "无效的JSON格式"}},
            user_id
        )
        return None


async def _validate_message_structure(
    data: dict,
    user_id: int
) -> Optional[WebSocketMessage]:
    """验证消息结构, 返回None表示失败"""
    try:
        return WebSocketMessage(**data)
    except (ValueError, TypeError) as e:
        await manager.send_personal_message(
            {"type": "error", "data": {"message": f"消息格式错误: {str(e)}"}},
            user_id
        )
        return None


async def _route_message(
    message: WebSocketMessage,
    user_id: int,
    db: AsyncSession,
    websocket: WebSocket
):
    """根据消息类型路由到不同处理器"""
    msg_type = message.type
    data = message.data

    handlers = {
        "chat_message": _handle_chat_message_ws,
        "read_receipt": _handle_read_receipt_ws,
        "typing": _handle_typing_status_ws,
        "ping": _handle_ping_ws,
    }

    handler = handlers.get(msg_type)
    if handler:
        await handler(data, user_id, db, websocket)


async def _handle_chat_message_ws(
    data: dict,
    user_id: int,
    db: AsyncSession,
    websocket: WebSocket
):
    """处理聊天消息"""
    # 速率限制
    if not rate_limiter.is_allowed(user_id):
        await websocket.close(code=4008, reason="消息发送过快")
        return

    # 数据验证
    try:
        chat_data = ChatMessageData(**data)
    except (ValueError, TypeError) as e:
        await manager.send_personal_message(
            {"type": "error", "data": {"message": f"消息数据错误: {str(e)}"}},
            user_id
        )
        return

    # 发送消息
    result = await handle_chat_message(chat_data.model_dump(), user_id, db)
    if result:
        await manager.send_personal_message(result, user_id)


async def _handle_read_receipt_ws(
    data: dict,
    user_id: int,
    db: AsyncSession,
    _websocket: WebSocket  # 保持接口一致，但可能用不到
):
    """处理已读回执"""
    try:
        read_data = ReadReceiptData(**data)
    except (ValueError, TypeError):
        return

    await update_read_index(read_data.model_dump(), user_id, db)


async def _handle_typing_status_ws(
    data: dict,
    user_id: int,
    db: AsyncSession,
    _websocket: WebSocket
):
    """处理正在输入状态"""
    try:
        typing_data = TypingStatusData(**data)
    except (ValueError, TypeError):
        return

    await handle_typing_status(typing_data.model_dump(), user_id, db)


async def _handle_ping_ws(
    _data: dict,
    _user_id: int,
    _db: AsyncSession,
    websocket: WebSocket
):
    """处理心跳"""
    await websocket.send_json({"type": "pong"})


async def push_offline_messages(user_id: int, db: AsyncSession):
    """推送离线期间的消息"""

    # 查询用户所有会话的已读位置和最新消息
    result = await db.execute(
        select(
            ConversationMember.conversation_id,
            ConversationMember.read_msg_id,
            ConversationMember.role
        )
        .where(ConversationMember.user_id == user_id)
    )

    for conv_id, read_id, role in result.all():
        if role not in ACTIVE_GROUP_ROLES:
            continue
        # 查询未读消息
        msg_result = await db.execute(
            select(Message).where(
                and_(
                    Message.conversation_id == conv_id,
                    Message.msg_id > read_id
                )
            ).order_by(Message.msg_id)
        )

        messages = msg_result.scalars().all()
        if messages:
            formatted_messages = []
            for msg in messages:
                formatted_messages.append({
                    "msg_id": msg.msg_id,
                    "conversation_id": msg.conversation_id,
                    "sender_id": msg.sender_id,
                    "content": msg.content,
                    "msg_type": msg.msg_type,
                    "created_at": msg.created_at.isoformat()
                    if msg.created_at else None,
                    "reply_to": msg.reply_to
                })

            await manager.send_personal_message({
                "type": "offline_messages",
                "data": {
                    "conversation_id": conv_id,
                    "messages": formatted_messages
                }
            }, user_id)


async def update_read_index(data: dict, user_id: int, db: AsyncSession):
    """更新已读位置"""

    await db.execute(
        update(ConversationMember)
        .where(
            and_(
                ConversationMember.user_id == user_id,
                ConversationMember.conversation_id == data["conversation_id"]
            )
        )
        .values(read_msg_id=data["last_read_msg_id"])
    )
    await db.commit()


class ConnectionManager:
    def __init__(self):
        # user_id -> WebSocket
        self.active_connections: dict[int, WebSocket] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: int):
        self.active_connections.pop(user_id, None)

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(message)


manager = ConnectionManager()


async def handle_chat_message(
    data: dict,
    sender_id: int,
    db: AsyncSession
):
    # pylint: disable=too-many-return-statements
    """处理并存储消息，推送给在线用户"""
    conversation_id = data["conversation_id"]
    reply_to = data.get("reply_to")

    # 验证会话存在
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.conversation_id == conversation_id
        )
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        return {"type": "error", "data": {"message": "不在该会话中"}}

    # 验证发送者是否在该会话中
    member_result = await db.execute(
        select(ConversationMember).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == sender_id
            )
        )
    )

    member = member_result.scalar_one_or_none()
    access_error = None
    if not member:
        access_error = "不在该会话中"
    elif conversation.type == "group" and member.role not in (
        "owner", "admin", "member"
    ):
        access_error = "您已被移出群聊，不能发言"
    if access_error:
        return {"type": "error", "data": {"message": access_error}}

    # 验证回复消息有效性
    if reply_to:
        reply_msg_result = await db.execute(
            select(Message).where(
                and_(
                    Message.msg_id == reply_to,
                    Message.conversation_id == conversation_id
                )
            )
        )
        if not reply_msg_result.scalar_one_or_none():
            return {"type": "error", "data": {"message": "回复的消息不存在"}}

    # 查询会话中所有成员活跃状态
    member_query = select(ConversationMember.user_id).where(
        ConversationMember.conversation_id == conversation_id
    )
    if conversation.type == "group":
        member_query = member_query.where(
            ConversationMember.role.in_(ACTIVE_GROUP_ROLES)
        )
    result = await db.execute(member_query)
    member_ids = [row[0] for row in result.all()]

    users_result = await db.execute(
        select(
            User.user_id, User.is_active
        ).where(User.user_id.in_(member_ids))
    )
    users_status = {u.user_id: u.is_active for u in users_result.all()}

    if not users_status.get(sender_id, True):
        return {"type": "error", "data": {"message": "您的账号已注销，无法发送消息"}}

    # === 私聊：若对方已注销/被单删，禁止发送 ===
    if conversation.type == "private":
        other_user_id = (member_ids[0]
                         if member_ids[0] != sender_id
                         else member_ids[1])

        if not users_status.get(other_user_id, True):
            return {"type": "error",
                    "data": {"message": "对方已注销，无法发送消息"}}

        friend_result = await db.execute(
            select(Friendship).where(
                and_(
                    Friendship.status == "accepted",
                    or_(
                        and_(
                            Friendship.user_id == sender_id,
                            Friendship.friend_id == other_user_id
                        ),
                        and_(
                            Friendship.user_id == other_user_id,
                            Friendship.friend_id == sender_id
                        )
                    )
                )
            )
        )
        if not friend_result.scalar_one_or_none():
            return {"type": "error",
                    "data": {"message": "对方已不是您的好友，无法发送消息"}}

    return await _save_and_push_message(
        data, sender_id, conversation_id, db,
        member_ids, users_status, reply_to
    )


async def _save_and_push_message(data,
                                 sender_id,
                                 conversation_id,
                                 db,
                                 member_ids,
                                 users_status,
                                 reply_to):
    """handle_chat_message的辅助函数: 存储并推送消息"""
    active_member_ids = [
        uid for uid in member_ids if users_status.get(uid, True)
    ]

    # 存储消息到数据库
    message = Message(
        conversation_id=conversation_id,
        sender_id=sender_id,
        content=data["content"],
        msg_type=data.get("msg_type", "text"),
        reply_to=reply_to
    )
    db.add(message)
    await db.flush()  # 获取 msg_id
    msg_id = message.msg_id

    # 获取发送者信息
    user_result = await db.execute(
        select(User).where(User.user_id == sender_id)
    )
    sender = user_result.scalar_one_or_none()

    # 推送给在线成员
    push_data = {
        "type": "new_message",
        "data": {
            "msg_id": msg_id,
            "conversation_id": conversation_id,
            "sender_id": sender_id,
            "sender_name": (sender.nickname or sender.username
                            if sender
                            else None),
            "sender_avatar": sender.avatar_url if sender else None,
            "content": data["content"],
            "msg_type": data.get("msg_type", "text"),
            "created_at": message.created_at.isoformat(),
            "reply_to": reply_to
        }
    }

    for member_id in active_member_ids:  # 不推送给已注销用户
        if member_id != sender_id:  # 不推送给发送者自己
            await manager.send_personal_message(push_data, member_id)

    if active_member_ids:
        await db.execute(
            update(ConversationMember)
            .where(
                and_(
                    ConversationMember.conversation_id == conversation_id,
                    ConversationMember.user_id.in_(active_member_ids)
                )
            )
            .values(is_hidden=False)
        )

    await db.commit()

    # 返回确认消息给发送者
    return {
        "type": "message_sent",
        "data": {
            "msg_id": msg_id,
            "conversation_id": conversation_id,
            "temp_id": data.get("temp_id"),  # 客户端临时 ID，用于确认
            "reply_to": reply_to
        }
    }


async def handle_typing_status(data: dict, user_id: int, db: AsyncSession):
    """处理正在输入状态"""
    conversation_id = data["conversation_id"]
    is_typing = data.get("is_typing", False)

    # 查询会话中其他成员
    result = await db.execute(
        select(ConversationMember.user_id).where(
            and_(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id != user_id
            )
        )
    )
    member_ids = [row[0] for row in result.all()]

    # 推送输入状态
    status_data = {
        "type": "typing_status",
        "data": {
            "conversation_id": conversation_id,
            "user_id": user_id,
            "is_typing": is_typing
        }
    }

    for member_id in member_ids:
        await manager.send_personal_message(status_data, member_id)
