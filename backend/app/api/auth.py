import os
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from fastapi import (APIRouter,
                     Depends,
                     HTTPException,
                     status,
                     UploadFile,
                     File)

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password
)
from app.db.database import get_db
from app.models.message import Conversation, ConversationMember, Message
from app.models.user_management import User
from app.schemas.user import (
    Token,
    UserLogin,
    UserRegister,
    UserResponse,
    UserUpdate
)

ALLOWED_AVATAR_CONTENT_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp"
}
_CONTENT_TYPE_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
SHANGHAI = "Asia/Shanghai"
USER_NOT_EXIST = "用户不存在"
DELETED_USER_MARKER = "deleted"  # NOSONAR

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED
)
async def register(
    user: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """注册新用户"""

    # 1. 检查用户名或邮箱是否已存在 (仅在活跃用户中检查)
    conditions = [
        User.username == user.username,
        User.email == user.email
    ]
    existing_user_result = await db.execute(
        select(User).where(or_(*conditions))
    )

    # 核心修改：使用 .first() 而不是 .scalar_one_or_none()
    if existing_user_result.first():
        raise HTTPException(status_code=400, detail="用户名或邮箱已存在")

    # 2. 检查手机号是否已存在
    if user.phone is not None:
        existing_phone_result = await db.execute(
            select(User).where(
                User.phone == user.phone
            )
        )
        # 同样使用 .first()
        if existing_phone_result.first():
            raise HTTPException(400, "手机号已存在")

    hashed_pwd = hash_password(user.password)
    now = datetime.now(ZoneInfo(SHANGHAI))
    new_user = User(
        username=user.username,
        password_hash=hashed_pwd,
        email=user.email,
        phone=user.phone,
        nickname=user.nickname or user.username,
        created_at=now,
        updated_at=now
    )
    db.add(new_user)

    # 核心修改：增加 try...except 捕获底层数据库约束异常
    try:
        await db.commit()
        await db.refresh(new_user)
    except IntegrityError as exc:
        # 必须先回滚会话
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail="该用户名、邮箱或手机号已被占用，或曾在注销账户中未被彻底释放"
        ) from exc
    # 4. 返回新用户信息（不含密码）
    return UserResponse(
        user_id=new_user.user_id,
        username=new_user.username,
        nickname=new_user.nickname,
        email=new_user.email,
        phone=new_user.phone,
        avatar_url=new_user.avatar_url,
        created_at=new_user.created_at
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取当前登录用户的详细信息"""
    user_id = current_user["user_id"]
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=USER_NOT_EXIST
        )
    # 映射到响应模型
    return UserResponse(
        user_id=user.user_id,
        username=user.username,
        nickname=user.nickname,
        email=user.email,
        phone=user.phone,
        avatar_url=user.avatar_url,
        created_at=user.created_at
    )


@router.post("/login", response_model=Token)
async def login(
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """用户登录"""
    # 查询用户
    result = await db.execute(
        select(User).where(User.username == login_data.username)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(
        login_data.password,
        user.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="用户名或密码错误"
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="该账号已注销")

    access_token = create_access_token(
        data={"sub": str(user.user_id), "username": user.username}
    )
    return Token(access_token=access_token)


@router.delete(
    "/delete_account",
    status_code=status.HTTP_204_NO_CONTENT
)
async def delete_account(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """用户注销(软删除)"""
    user_id = current_user["user_id"]
    result = await db.execute(
        select(User).where(
            User.user_id == user_id
        )
    )
    user = result.scalar_one_or_none()
    if user:
        group_members_result = await db.execute(
            select(ConversationMember)
            .join(
                Conversation,
                (
                    Conversation.conversation_id
                    == ConversationMember.conversation_id
                )
            )
            .where(
                and_(
                    ConversationMember.user_id == user_id,
                    Conversation.type == "group",
                    ConversationMember.role.in_(("owner", "admin", "member"))
                )
            )
        )
        group_memberships = group_members_result.scalars().all()

        for member in group_memberships:
            if member.role == "owner":
                next_owner_result = await db.execute(
                    select(ConversationMember)
                    .join(User, User.user_id == ConversationMember.user_id)
                    .where(
                        and_(
                            ConversationMember.conversation_id
                            == member.conversation_id,
                            ConversationMember.user_id != user_id,
                            ConversationMember.role.in_(
                                ("owner", "admin", "member")
                            ),
                            User.is_active.is_(True)
                        )
                    )
                    .order_by(
                        ConversationMember.joined_at.asc(),
                        ConversationMember.id.asc()
                    )
                    .limit(1)
                )
                next_owner = next_owner_result.scalar_one_or_none()
                if next_owner:
                    next_owner.role = "owner"

            last_msg_result = await db.execute(
                select(func.max(Message.msg_id)).where(
                    Message.conversation_id == member.conversation_id
                )
            )
            member.read_msg_id = last_msg_result.scalar() or 0
            member.role = "removed"
        # 软删除：标记为不活跃，清空敏感信息
        user.is_active = False
        # 释放邮箱和用户名 (加上时间戳或UUID防止多次注销导致 deleted_xx 冲突)
        random_suffix = uuid.uuid4().hex[:8]
        user.username = f"del_{user_id}_{random_suffix}"
        user.email = f"del_{user_id}_{random_suffix}@deleted.com"
        user.phone = None
        user.nickname = "已注销用户"
        user.avatar_url = None
        # 彻底破坏密码，防止任何绕过 is_active 的登录漏洞
        user.password_hash = DELETED_USER_MARKER
        await db.commit()


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    _current_user: dict = Depends(get_current_user)
):
    return {"message": "Logged out successfully"}


async def _check_field_unique(db, field, value, user_id, error_msg):
    """Check that a field value is unique, excluding the given user_id."""
    result = await db.execute(
        select(User.user_id).where(
            field == value,
            User.user_id != user_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=error_msg)


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    update_data: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["user_id"]

    # 获取用户对象
    result = await db.execute(
        select(User).where(User.user_id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=404, detail=USER_NOT_EXIST
        )

    # 敏感字段：修改这些字段需要验证当前密码
    sensitive_fields = ["username", "email", "phone", "password"]
    need_verify = any(
        getattr(update_data, field) is not None
        for field in sensitive_fields
    )

    if need_verify:
        if not update_data.current_password:
            raise HTTPException(
                status_code=400,
                detail="修改敏感信息需要提供当前密码",
            )
        if not verify_password(
            update_data.current_password,
            user.password_hash,
        ):
            raise HTTPException(
                status_code=401,
                detail="当前密码错误",
            )

    # 1. 检查用户名唯一性
    if update_data.username is not None:
        await _check_field_unique(
            db, User.username, update_data.username, user_id, "用户名已存在"
        )
        user.username = update_data.username

    # 2. 检查邮箱唯一性
    if update_data.email is not None:
        await _check_field_unique(
            db, User.email, update_data.email, user_id, "邮箱已存在"
        )
        user.email = update_data.email

    if update_data.phone is not None:
        await _check_field_unique(
            db, User.phone, update_data.phone, user_id, "手机号已存在"
        )
        user.phone = update_data.phone

    # 4. 更新非敏感字段
    if update_data.nickname is not None:
        user.nickname = update_data.nickname
    if update_data.avatar_url is not None:
        user.avatar_url = update_data.avatar_url

    # 5. 更新密码（需哈希）
    if update_data.password is not None:
        user.password_hash = hash_password(update_data.password)

    # 如果没有任何字段被更新，直接返回当前用户信息
    updated_fields = [
        "username", "email", "nickname", "phone", "avatar_url", "password"
    ]
    if not any(
        getattr(update_data, field) is not None for field in updated_fields
    ):
        return user

    # 更新时间戳
    user.updated_at = datetime.now(ZoneInfo(SHANGHAI))

    await db.commit()
    await db.refresh(user)
    return user


@router.post("/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """上传头像文件并更新用户头像"""
    # 验证文件类型
    if file.content_type not in ALLOWED_AVATAR_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不支持的文件类型，仅允许 JPEG、PNG、GIF、WebP 格式",
        )

    # 读取文件内容并验证大小
    content = await file.read()
    if len(content) > settings.max_avatar_size:
        max_mb = settings.max_avatar_size // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"文件过大，最大允许 {max_mb} MB",
        )

    # 获取用户
    user_id = current_user["user_id"]
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=USER_NOT_EXIST)

    # 保存文件
    ext = os.path.splitext(
        file.filename or "")[1].lower() or _CONTENT_TYPE_EXT[file.content_type]
    filename = f"{uuid.uuid4().hex}{ext}"
    avatar_dir = os.path.join(settings.upload_dir, "avatars")
    os.makedirs(avatar_dir, exist_ok=True)
    file_path = os.path.join(avatar_dir, filename)
    with open(file_path, "wb") as f:
        f.write(content)

    # 更新数据库中的头像 URL
    user.avatar_url = f"/uploads/avatars/{filename}"
    user.updated_at = datetime.now(ZoneInfo(SHANGHAI))
    await db.commit()
    await db.refresh(user)
    return user
