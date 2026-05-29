import pytest_asyncio
from typing import AsyncGenerator
from pathlib import Path
from httpx import AsyncClient, ASGITransport
import os


os.environ.setdefault("UPLOAD_DIR", "/tmp/backend_uploads")
os.environ.setdefault("TESTING", "1")

from app.main import app
from app.db.database import db, init_db
from app.core import config

TEST_DB_PATH = Path("/tmp/im_db_test.sqlite3")
TEST_DB_URL = f"sqlite+aiosqlite:///{TEST_DB_PATH}"


@pytest_asyncio.fixture(scope="function")
async def client() -> AsyncGenerator:
    """创建测试客户端，每个测试前重置数据库状态"""
    # 1. 创建测试数据库
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()

    # 2. 修改 app 的数据库配置指向测试数据库
    original_database_url = config.settings.database_url
    config.settings.database_url = TEST_DB_URL

    # 3. 重新连接数据库
    await db.disconnect()
    await db.connect()

    # 4. 创建表结构
    await init_db()

    # 5. 创建测试客户端
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    # 删除测试数据库
    config.settings.database_url = original_database_url
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()
