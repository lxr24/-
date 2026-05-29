from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class ConversationResponse(BaseModel):
    conversation_id: int
    conversation_name: Optional[str] = None
    type: str  # private / group
    avatar_url: Optional[str] = None  # 会话头像
    last_message: Optional[str] = None
    last_message_time: Optional[datetime] = None
    unread_count: int = 0
    created_at: datetime
    is_pinned: bool
    do_not_disturb: bool
    role: str  # 标识用户在该会话的角色/状态 (owner/admin/member/quit/kicked)
    is_hidden: bool


class MessageResponse(BaseModel):
    msg_id: int
    conversation_id: int
    sender_id: int
    sender_name: Optional[str] = None
    sender_avatar: Optional[str] = None
    content: str
    msg_type: str = "text"
    created_at: datetime
    is_self: bool = False  # 是否是自己发的
    reply_to: Optional[int] = None      # 被回复的消息ID
    reply_count: int = 0                # 这条消息被多少条消息回复


class CreateConversationRequest(BaseModel):
    type: str  # "private" 或 "group"
    target_user_id: Optional[int] = None  # 私聊时必填
    member_ids: Optional[List[int]] = None  # 群聊时必填
    group_name: Optional[str] = None  # 群聊时必填


class CreateConversationResponse(BaseModel):
    conversation_id: int
    type: str
    conversation_name: Optional[str] = None
    is_new: bool  # 是否是新创建的会话（私聊时可能已存在）


class MarkReadRequest(BaseModel):
    last_read_msg_id: int


class UpdateConversationSettingsRequest(BaseModel):
    is_pinned: Optional[bool] = None
    do_not_disturb: Optional[bool] = None
