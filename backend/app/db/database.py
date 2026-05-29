import asyncio
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from app.core.config import settings
from app.models.user_management import Base


class Database:
    def __init__(self):
        self._engine = None
        self._async_session_local = None
        self._connect_lock = asyncio.Lock()   # 新增

    @property
    def is_connected(self):
        return self._engine is not None

    async def connect(self):
        """初始化数据库连接池（并发安全）"""
        async with self._connect_lock:
            if self._engine is not None:
                return

            database_url = settings.database_url
            if database_url.startswith("sqlite+"):
                self._engine = create_async_engine(database_url, echo=True)
            else:
                self._engine = create_async_engine(
                    database_url,
                    echo=True,
                    pool_pre_ping=True,
                    pool_recycle=1800,
                    connect_args={"connect_timeout": 10},
                )

            self._async_session_local = async_sessionmaker(
                self._engine, class_=AsyncSession, expire_on_commit=False
            )

    async def disconnect(self):
        """关闭连接池"""
        async with self._connect_lock:
            if self._engine:
                await self._engine.dispose()
                self._engine = None
                self._async_session_local = None

    def begin(self):
        if self._engine is None:
            raise RuntimeError(
                "Database is not connected. Call connect() first."
            )
        return self._engine.begin()

    def create_session(self):
        if self._async_session_local is None:
            raise RuntimeError(
                "Database is not connected. Call connect() first."
            )
        return self._async_session_local()


db = Database()


async def init_db():
    """初始化数据库表"""
    async with db.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    """依赖注入：获取数据库会话"""
    if not db.is_connected:
        await db.connect()

    async with db.create_session() as session:
        try:
            yield session
        except Exception:
            # 关键：异常时回滚，释放失败事务状态
            await session.rollback()
            raise
        finally:
            # 明确 close（async with 通常会做，但这样更稳、更清晰）
            await session.close()
