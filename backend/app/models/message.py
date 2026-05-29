# app/models/message.py
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Boolean,
)
from sqlalchemy.dialects.mysql import BIGINT
from app.models.user_management import Base, ID_TYPE, USER_ID


SHANGHAI = "Asia/Shanghai"


class Conversation(Base):
    """会话表"""
    __tablename__ = "conversations"

    conversation_id = Column(
        ID_TYPE,
        primary_key=True,
        autoincrement=True
    )
    conversation_name = Column(String(100))
    type = Column(String(20), default="private")  # private/group
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo(SHANGHAI))
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo(SHANGHAI)),
        onupdate=lambda: datetime.now(ZoneInfo(SHANGHAI))
    )


class ConversationMember(Base):
    """会话成员表"""
    __tablename__ = "conversation_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(
        BIGINT(unsigned=True).with_variant(Integer(), "sqlite"),
        ForeignKey("conversations.conversation_id", ondelete="CASCADE")
    )
    user_id = Column(
        BIGINT(unsigned=True).with_variant(Integer(), "sqlite"),
        ForeignKey(USER_ID, ondelete="CASCADE")
    )
    # 已读到的最后一条消息ID
    read_msg_id = Column(ID_TYPE, default=0)
    joined_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo(SHANGHAI))
    )
    is_pinned = Column(Boolean, default=False)
    do_not_disturb = Column(Boolean, default=False)
    role = Column(String(20), default="member")
    is_hidden = Column(Boolean, default=False)


class Message(Base):
    """消息表"""
    __tablename__ = "messages"

    msg_id = Column(
        ID_TYPE,
        primary_key=True,
        autoincrement=True
    )
    conversation_id = Column(
        ID_TYPE,
        ForeignKey("conversations.conversation_id", ondelete="CASCADE")
    )
    sender_id = Column(
        ID_TYPE,
        ForeignKey(USER_ID, ondelete="CASCADE")
    )
    content = Column(String(2000), nullable=False)
    msg_type = Column(String(20), default="text")  # text/image/file/system
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo(SHANGHAI))
    )
    reply_to = Column(
        ID_TYPE,
        ForeignKey("messages.msg_id", ondelete="SET NULL"),
        nullable=True
    )


class DeletedMessage(Base):
    """用户删除的消息记录(软删除)"""
    __tablename__ = "deleted_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        ID_TYPE,
        ForeignKey(USER_ID, ondelete="CASCADE"),
        nullable=False
    )
    msg_id = Column(
        ID_TYPE,
        ForeignKey("messages.msg_id", ondelete="CASCADE"),
        nullable=False
    )
    deleted_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo(SHANGHAI))
    )
