from typing import Optional

from pydantic import BaseModel


class FriendSearchResult(BaseModel):
    user_id: int
    username: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    status: Optional[str] = None


class SendFriendRequest(BaseModel):
    friend_id: int


class AcceptFriendRequest(BaseModel):
    request_id: int


class FriendInfo(BaseModel):
    user_id: int
    username: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    status: str
    created_at: str


# 分组相关的 Schema
class FriendGroupCreate(BaseModel):
    group_name: str


class FriendGroupUpdate(BaseModel):
    group_name: str


class FriendGroupResponse(BaseModel):
    id: int
    group_name: str
    created_at: Optional[str] = None


class AddFriendToGroup(BaseModel):
    friend_id: int
    group_id: int


class RemoveFriendFromGroup(BaseModel):
    friend_id: int
    group_id: int
