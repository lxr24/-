import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserBase(BaseModel):
    # 全部设为 Optional，供子类覆盖
    username: Optional[str] = Field(
        None, min_length=3, max_length=32, pattern="^[a-zA-Z0-9_]+$"
    )
    password: Optional[str] = Field(None, min_length=6)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    nickname: Optional[str] = Field(None, max_length=32)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not re.search(r"\d", v):
            raise ValueError("密码必须包含数字")
        if not re.search(r"[A-Za-z]", v):
            raise ValueError("密码必须包含字母")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.fullmatch(r"^1[3-9]\d{9}$", v):
            raise ValueError("手机号格式不正确")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v.isdigit():
            raise ValueError("用户名不能为纯数字")
        return v


class UserRegister(UserBase):
    # 覆盖为必填字段
    username: str = Field(
        ...,
        min_length=3,
        max_length=32,
        pattern="^[a-zA-Z0-9_]+$"
    )
    password: str = Field(..., min_length=6)
    email: EmailStr  # 必填
    # phone, nickname 保持 Optional，无需重写


class UserUpdate(UserBase):
    avatar_url: Optional[str] = Field(None, max_length=256)
    current_password: Optional[str] = None
    # 所有字段均继承为 Optional，符合更新语义


class UserResponse(BaseModel):
    user_id: int
    username: str
    nickname: str
    email: str
    phone: str | None
    avatar_url: str | None
    created_at: datetime


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
