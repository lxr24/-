from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.exceptions import TokenExpiredError, TokenInvalidError
from app.core.security import decode_access_token
from app.db.database import get_db
from app.models.user_management import User


security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
    except TokenExpiredError as e:
        raise HTTPException(status_code=401, detail="令牌已过期，请重新登录") from e
    except TokenInvalidError as e:
        raise HTTPException(status_code=401, detail="无效的认证令牌") from e

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="无效的令牌内容")
    result = await db.execute(
        select(User).where(User.user_id == int(user_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="用户不存在"
        )
    return {"user_id": user.user_id, "username": user.username}
