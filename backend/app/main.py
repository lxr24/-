import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import auth, friends, websocket, conversations
from app.core.config import settings
from app.db.database import db, init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await db.connect()
    await init_db()
    yield
    await db.disconnect()
app = FastAPI(lifespan=lifespan)

app.include_router(auth.router)
app.include_router(friends.router)
app.include_router(websocket.router)
app.include_router(conversations.router)

_uploads_dir = settings.upload_dir
os.makedirs(_uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")
