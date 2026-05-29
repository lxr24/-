from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import (
    Column,
    String,
    DateTime,
    ForeignKey,
)
from app.models.user_management import Base, ID_TYPE, USER_ID


class GroupAnnouncement(Base):
    """群公告表"""
    __tablename__ = "group_announcements"

    announcement_id = Column(
        ID_TYPE,
        primary_key=True,
        autoincrement=True
    )
    conversation_id = Column(
        ID_TYPE,
        ForeignKey("conversations.conversation_id", ondelete="CASCADE")
    )
    creator_id = Column(
        ID_TYPE,
        ForeignKey(USER_ID, ondelete="CASCADE")
    )
    content = Column(String(2000), nullable=False)
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo("Asia/Shanghai"))
    )


class GroupInvitation(Base):
    """群聊邀请/审核表"""
    __tablename__ = "group_invitations"

    invitation_id = Column(
        ID_TYPE,
        primary_key=True,
        autoincrement=True
    )
    conversation_id = Column(
        ID_TYPE,
        ForeignKey("conversations.conversation_id", ondelete="CASCADE")
    )
    inviter_id = Column(
        ID_TYPE,
        ForeignKey(USER_ID, ondelete="CASCADE")
    )
    invitee_id = Column(
        ID_TYPE,
        ForeignKey(USER_ID, ondelete="CASCADE")
    )
    status = Column(String(20), default="pending")  # pending/approved/rejected
    reviewer_id = Column(
        ID_TYPE,
        ForeignKey(USER_ID, ondelete="SET NULL"),
        nullable=True
    )
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo("Asia/Shanghai"))
    )
    reviewed_at = Column(DateTime, nullable=True)
