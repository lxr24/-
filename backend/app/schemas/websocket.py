from typing import Optional, Literal

import bleach
from pydantic import BaseModel, Field, field_validator


class ChatMessageData(BaseModel):
    conversation_id: int = Field(..., gt=0)
    content: str = Field(..., min_length=1, max_length=10000)
    msg_type: Literal["text", "image", "file"] = Field(default="text")
    reply_to: Optional[int] = Field(None, gt=0)
    temp_id: Optional[int] = Field(None, gt=0)

    @field_validator('content')
    @classmethod
    def sanitize_content(cls, v):
        cleaned = bleach.clean(v, tags=[], strip=True)
        cleaned = ' '.join(cleaned.split())
        if not cleaned:
            raise ValueError('消息内容不能为空')
        return cleaned

    @field_validator('temp_id')
    @classmethod
    def validate_temp_id(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v <= 0:
            raise ValueError('无效的临时ID')
        return v


class ReadReceiptData(BaseModel):
    conversation_id: int = Field(..., gt=0)
    last_read_msg_id: int = Field(..., ge=0)


class TypingStatusData(BaseModel):
    conversation_id: int = Field(..., gt=0)
    is_typing: bool = Field(default=False)


class WebSocketMessage(BaseModel):
    type: Literal["chat_message", "read_receipt", "typing", "ping"]
    data: dict = Field(default={})
