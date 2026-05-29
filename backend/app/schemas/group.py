from typing import Optional, List, Literal
from datetime import datetime
from pydantic import BaseModel


class GroupMemberInfo(BaseModel):
    user_id: int
    username: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str
    joined_at: Optional[datetime] = None


class GroupAnnouncementInfo(BaseModel):
    announcement_id: int
    content: str
    creator_id: int
    creator_name: Optional[str] = None
    created_at: datetime


class GroupInfoResponse(BaseModel):
    conversation_id: int
    conversation_name: Optional[str] = None
    members: list[GroupMemberInfo]
    announcements: list[GroupAnnouncementInfo]


class CreateGroupAnnouncementRequest(BaseModel):
    content: str


class CreateGroupAnnouncementResponse(BaseModel):
    announcement_id: int
    created_at: datetime


class GroupInviteRequest(BaseModel):
    invitee_ids: List[int]


class GroupInviteResponse(BaseModel):
    invitation_ids: List[int]


class GroupInviteInfo(BaseModel):
    invitation_id: int
    inviter_id: int
    inviter_username: str
    inviter_avatar_url: Optional[str] = None
    invitee_id: int
    invitee_username: str
    invitee_avatar_url: Optional[str] = None
    status: str
    reviewer_id: Optional[int] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None


class GroupInviteReviewRequest(BaseModel):
    action: Literal["approved", "rejected"]


class UpdateMemberRoleRequest(BaseModel):
    role: Literal["owner", "admin", "member"]
