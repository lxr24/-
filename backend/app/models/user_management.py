# app/db/models.py
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
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import declarative_base, relationship


Base = declarative_base()

USER_ID = "users.user_id"
ID_TYPE = BIGINT(unsigned=True).with_variant(Integer(), "sqlite")
SHANGHAI = "Asia/Shanghai"


class User(Base):
    """用户表"""

    __tablename__ = "users"

    user_id = Column(
        ID_TYPE,
        primary_key=True,
        autoincrement=True
    )
    username = Column(String(32), unique=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    email = Column(String(128), unique=True, nullable=False)
    phone = Column(String(20))
    nickname = Column(String(32))
    avatar_url = Column(String(255))
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo(SHANGHAI))
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo(SHANGHAI)),
        onupdate=lambda: datetime.now(ZoneInfo(SHANGHAI))
    )
    is_active = Column(Boolean, default=True, nullable=False)


class Friendship(Base):
    """好友关系表"""

    __tablename__ = "friendships"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        ID_TYPE,
        ForeignKey(USER_ID, ondelete="CASCADE"),
        nullable=False
    )
    friend_id = Column(
        ID_TYPE,
        ForeignKey(USER_ID, ondelete="CASCADE"),
        nullable=False
    )
    status = Column(String(20), default="pending")
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo(SHANGHAI))
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo(SHANGHAI)),
        onupdate=lambda: datetime.now(ZoneInfo(SHANGHAI))
    )

    # 关系（可选，方便查询）
    user = relationship("User", foreign_keys=[user_id])
    friend = relationship("User", foreign_keys=[friend_id])


class FriendGroup(Base):
    """好友分组表(可选)"""

    __tablename__ = "friend_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        ID_TYPE,
        ForeignKey(USER_ID, ondelete="CASCADE"),
        nullable=False
    )
    group_name = Column(String(50), nullable=False)
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo(SHANGHAI))
    )


class FriendGroupMember(Base):
    """好友-分组关联表"""

    __tablename__ = "friend_group_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(
        Integer,
        ForeignKey("friend_groups.id", ondelete="CASCADE"),
        nullable=False
    )
    friend_id = Column(
        ID_TYPE,
        ForeignKey(USER_ID, ondelete="CASCADE"),
        nullable=False
    )
    created_at = Column(
        DateTime,
        default=lambda: datetime.now(ZoneInfo(SHANGHAI))
    )


async def get_friendship_status(
        db: AsyncSession,
        user_id: int,
        target_id: int
) -> str | None:
    """获取两个用户之间的好友关系状态

    Returns:
        str: "pending", "accepted", "blocked"等状态
        None: 无好友关系
    """
    result = await db.execute(
        select(Friendship).where(
            or_(
                and_(
                    Friendship.user_id == user_id,
                    Friendship.friend_id == target_id
                ),
                and_(
                    Friendship.user_id == target_id,
                    Friendship.friend_id == user_id
                )
            )
        )
    )
    friendship = result.scalar_one_or_none()
    return friendship.status if friendship else None


async def get_batch_friendship_status(
        db: AsyncSession,
        user_id: int,
        target_ids: list[int]
) -> dict[int, str | None]:
    """批量获取用户与多个目标用户的好友关系状态

    Returns:
        dict: {target_id: status}  status 为 None 表示无关系
    """
    if not target_ids:
        return {}

    result = await db.execute(
        select(Friendship).where(
            or_(
                and_(
                    Friendship.user_id == user_id,
                    Friendship.friend_id.in_(target_ids)
                ),
                and_(
                    Friendship.user_id.in_(target_ids),
                    Friendship.friend_id == user_id
                )
            )
        )
    )
    friendships = result.scalars().all()

    status_map = {}
    for f in friendships:
        other_id = f.friend_id if f.user_id == user_id else f.user_id
        status_map[other_id] = f.status

    return status_map
