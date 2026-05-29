"""Unit and integration tests for WebSocket functionality.
Coverage:
  - ConnectionManager (connect / disconnect / send_personal_message)
  - update_read_index
  - handle_typing_status
  - push_offline_messages
  - handle_chat_message
  - websocket_chat endpoint (origin check, token check, ping-pong,
    chat_message round-trip, read_receipt)
"""
from __future__ import annotations

import pytest
from contextlib import contextmanager
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.api.websocket import (
    ConnectionManager,
    handle_chat_message,
    handle_typing_status,
    push_offline_messages,
    update_read_index,
)
from app.core.security import create_access_token
from app.models.message import Conversation, ConversationMember, Message
from app.models.user_management import User, Friendship
from app.models.user_management import User, Friendship


# ─── shared helpers ──────────────────────────────────────────────────────────

def _mock_ws() -> AsyncMock:
    """Return a mock WebSocket."""
    from fastapi import WebSocket
    return AsyncMock(spec=WebSocket)


def _valid_token(user_id: int = 1) -> str:
    return create_access_token({"sub": str(user_id)})


@contextmanager
def _ws_client(mock_session: AsyncMock):
    """Yield a Starlette TestClient with all DB / lifespan hooks patched."""
    from app.main import app
    from app.db.database import get_db

    async def override_get_db():
        yield mock_session

    with (
        patch("app.db.database.db.connect", new_callable=AsyncMock),
        patch("app.db.database.db.disconnect", new_callable=AsyncMock),
        # init_db is imported by name into app.main, so patch it there.
        patch("app.main.init_db", new_callable=AsyncMock),
        # Silence push_offline_messages so it doesn't interfere with
        # message-specific assertions.
        patch(
            "app.api.websocket.push_offline_messages",
            new_callable=AsyncMock,
        ),
    ):
        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app, raise_server_exceptions=True) as client:
                yield client
        finally:
            app.dependency_overrides.pop(get_db, None)


# ─── ConnectionManager ───────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestConnectionManager:
    """Unit tests for ConnectionManager – no DB, pure mock WebSocket."""

    async def test_connect_accepts_websocket_and_stores_it(self):
        mgr = ConnectionManager()
        ws = _mock_ws()

        await mgr.connect(42, ws)

        ws.accept.assert_awaited_once()
        assert mgr.active_connections[42] is ws

    async def test_disconnect_removes_existing_connection(self):
        mgr = ConnectionManager()
        mgr.active_connections[1] = _mock_ws()

        mgr.disconnect(1)

        assert 1 not in mgr.active_connections

    async def test_disconnect_unknown_user_does_not_raise(self):
        mgr = ConnectionManager()
        mgr.disconnect(999)  # must not raise

    async def test_send_personal_message_reaches_online_user(self):
        mgr = ConnectionManager()
        ws = _mock_ws()
        mgr.active_connections[7] = ws

        payload = {"type": "test", "data": "hello"}
        await mgr.send_personal_message(payload, 7)

        ws.send_json.assert_awaited_once_with(payload)

    async def test_send_personal_message_to_offline_user_is_noop(self):
        mgr = ConnectionManager()
        # user 999 is not connected
        await mgr.send_personal_message({"type": "x"}, 999)  # must not raise


# ─── update_read_index ───────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestUpdateReadIndex:

    async def test_executes_update_and_commits(self):
        db = AsyncMock()
        db.execute.return_value = MagicMock()

        await update_read_index(
            {"conversation_id": 10, "last_read_msg_id": 55},
            user_id=1,
            db=db,
        )

        db.execute.assert_awaited_once()
        db.commit.assert_awaited_once()


# ─── handle_typing_status ────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestHandleTypingStatus:

    async def test_pushes_typing_status_to_all_other_online_members(self):
        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = [(2,), (3,)]
        db.execute.return_value = result

        mgr = ConnectionManager()
        ws2, ws3 = _mock_ws(), _mock_ws()
        mgr.active_connections[2] = ws2
        mgr.active_connections[3] = ws3

        with patch("app.api.websocket.manager", mgr):
            await handle_typing_status(
                {"conversation_id": 1, "is_typing": True},
                user_id=1,
                db=db,
            )

        expected = {
            "type": "typing_status",
            "data": {"conversation_id": 1, "user_id": 1, "is_typing": True},
        }
        ws2.send_json.assert_awaited_once_with(expected)
        ws3.send_json.assert_awaited_once_with(expected)

    async def test_no_error_when_all_recipients_are_offline(self):
        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = [(2,)]
        db.execute.return_value = result

        mgr = ConnectionManager()  # no active connections

        with patch("app.api.websocket.manager", mgr):
            # must not raise even if recipients are offline
            await handle_typing_status(
                {"conversation_id": 1, "is_typing": False},
                user_id=1,
                db=db,
            )


# ─── push_offline_messages ───────────────────────────────────────────────────

class _Msg:
    """Minimal message stand-in with a real __dict__."""
    def __init__(self, **kw):
        self.__dict__.update(kw)


@pytest.mark.asyncio
class TestPushOfflineMessages:

    async def test_nothing_sent_when_no_unread_messages(self):
        db = AsyncMock()

        conv_res = MagicMock()
        conv_res.all.return_value = [(10, 5, "member")]  # read up to msg 5

        msg_scalars = MagicMock()
        msg_scalars.all.return_value = []  # nothing newer
        msg_res = MagicMock()
        msg_res.scalars.return_value = msg_scalars

        db.execute.side_effect = [conv_res, msg_res]

        mgr = ConnectionManager()
        ws = _mock_ws()
        mgr.active_connections[1] = ws

        with patch("app.api.websocket.manager", mgr):
            await push_offline_messages(user_id=1, db=db)

        ws.send_json.assert_not_awaited()

    async def test_unread_messages_are_pushed_as_offline_messages(self):
        db = AsyncMock()

        conv_res = MagicMock()
        conv_res.all.return_value = [(10, 0, "member")]  # nothing read yet

        msg1 = _Msg(msg_id=1, content="Hello", conversation_id=10,
                    sender_id=5, msg_type="text", created_at=None, reply_to=None)
        msg2 = _Msg(msg_id=2, content="World", conversation_id=10,
                    sender_id=5, msg_type="text", created_at=None, reply_to=None)
        msg_scalars = MagicMock()
        msg_scalars.all.return_value = [msg1, msg2]
        msg_res = MagicMock()
        msg_res.scalars.return_value = msg_scalars

        db.execute.side_effect = [conv_res, msg_res]

        mgr = ConnectionManager()
        ws = _mock_ws()
        mgr.active_connections[1] = ws

        with patch("app.api.websocket.manager", mgr):
            await push_offline_messages(user_id=1, db=db)

        ws.send_json.assert_awaited_once()
        sent = ws.send_json.call_args[0][0]
        assert sent["type"] == "offline_messages"
        assert sent["data"]["conversation_id"] == 10
        assert len(sent["data"]["messages"]) == 2

    async def test_removed_member_receives_no_offline_messages(self):
        db = AsyncMock()

        conv_res = MagicMock()
        conv_res.all.return_value = [(10, 0, "removed")]
        db.execute.return_value = conv_res

        mgr = ConnectionManager()
        ws = _mock_ws()
        mgr.active_connections[1] = ws

        with patch("app.api.websocket.manager", mgr):
            await push_offline_messages(user_id=1, db=db)

        ws.send_json.assert_not_awaited()

# ─── handle_chat_message ─────────────────────────────────────────────────────

def _make_chat_db(
    is_member: bool,
    member_ids: list[int],
    nickname: str = "Alice",
    active_status: bool = True,
    has_reply_to = False,
    member_role: str = "member"
) -> AsyncMock:
    """Build a mock AsyncSession for handle_chat_message scenarios."""
    db = AsyncMock()
    db.add = MagicMock()  # add() is synchronous on AsyncSession
    results = []

    r_conv = MagicMock()
    r_conv.scalar_one_or_none.return_value = MagicMock(spec=Conversation)
    results.append(r_conv)

    r1 = MagicMock()
    if is_member:
        member = MagicMock(spec=ConversationMember)
        member.role = member_role
        r1.scalar_one_or_none.return_value = member
    else:
        r1.scalar_one_or_none.return_value = None
    results.append(r1)

    if not is_member:
        db.execute.side_effect = results
        return db
    
    if has_reply_to:
        r_reply = MagicMock()
        r_reply.scalar_one_or_none.return_value = MagicMock(spec=Message)
        results.append(r_reply)

    # ConversationMember.user_id
    r3 = MagicMock()
    r3.all.return_value = [(uid,) for uid in member_ids]
    results.append(r3)

    # User.user_id, User.is_active
    from collections import namedtuple
    UserStatus = namedtuple('UserStatus', ['user_id', 'is_active'])
    r4 = MagicMock()
    r4.all.return_value = [
        UserStatus(uid, active_status) for uid in member_ids
    ]
    results.append(r4)

    sender = MagicMock(spec=User)
    sender.nickname = nickname
    sender.username = "alice"
    sender.avatar_url = "https://example.com/avatar.jpg"
    r5 = MagicMock()
    r5.scalar_one_or_none.return_value = sender
    results.append(r5)

    r_update = MagicMock()
    results.append(r_update)

    db.execute.side_effect = results
    return db


def _mock_message(msg_id: int = 42) -> Message:
    msg = Message(
        conversation_id=0,
        sender_id=0,
        content="mock content",
        msg_type="text"
    )
    msg.msg_id = msg_id
    msg.created_at = datetime(2024, 6, 1, 10, 0, 0)
    return msg


@pytest.mark.asyncio
class TestHandleChatMessage:

    async def test_returns_error_when_sender_not_in_conversation(self):
        db = _make_chat_db(is_member=False, member_ids=[])
        result = await handle_chat_message(
            {"conversation_id": 1, "content": "Hi"}, sender_id=99, db=db
        )
        assert result["type"] == "error"
        assert result["data"] == {"message": "不在该会话中"}

    async def test_group_removed_member_cannot_send_message(self):
        db = _make_chat_db(
            is_member=True,
            member_ids=[1, 2],
            member_role="removed"
        )
        conv_result = MagicMock()
        conv_result.scalar_one_or_none.return_value = MagicMock(
            spec=Conversation, type="group"
        )
        member_result = MagicMock()
        member = MagicMock(spec=ConversationMember)
        member.role = "removed"
        member_result.scalar_one_or_none.return_value = member
        db.execute.side_effect = [conv_result, member_result]

        result = await handle_chat_message(
            {"conversation_id": 1, "content": "Hi"},
            sender_id=1,
            db=db
        )
        assert result["data"] == {"message": "您已被移出群聊，不能发言"}

    async def test_returns_message_sent_confirmation_to_sender(self):
        db = _make_chat_db(is_member=True, member_ids=[1, 2])

        mgr = ConnectionManager()
        with (
            patch("app.api.websocket.manager", mgr),
            patch.object(db, "flush", new_callable=AsyncMock),
            patch("app.models.message.Message.created_at", datetime(2024, 6, 1, 10, 0, 0)),
        ):
            result = await handle_chat_message(
                {"conversation_id": 5, "content": "Hello!", "temp_id": "tmp-1"},
                sender_id=1,
                db=db,
            )

        assert result is not None
        assert result["type"] == "message_sent"
        assert result["data"]["conversation_id"] == 5
        assert result["data"]["temp_id"] == "tmp-1"

    async def test_pushes_new_message_to_online_recipients(self):
        db = _make_chat_db(is_member=True, member_ids=[1, 2])

        mgr = ConnectionManager()
        ws2 = _mock_ws()
        mgr.active_connections[2] = ws2

        with (
            patch("app.api.websocket.manager", mgr),
            patch.object(db, "flush", new_callable=AsyncMock),
            patch("app.models.message.Message.created_at", datetime(2024, 6, 1, 10, 0, 0)),
        ):
            await handle_chat_message(
                {"conversation_id": 5, "content": "Hello!", "msg_type": "text"},
                sender_id=1,
                db=db,
            )

        ws2.send_json.assert_awaited_once()
        push = ws2.send_json.call_args[0][0]
        assert push["type"] == "new_message"
        assert push["data"]["content"] == "Hello!"
        assert push["data"]["sender_id"] == 1
        assert push["data"]["conversation_id"] == 5

    async def test_group_member_query_filters_removed_members(self):
        db = _make_chat_db(is_member=True, member_ids=[1, 2])
        query_calls = []
        original_execute = db.execute

        async def _capture_execute(statement):
            query_calls.append(str(statement))
            return await original_execute(statement)

        db.execute = AsyncMock(side_effect=_capture_execute)

        with (
            patch.object(db, "flush", new_callable=AsyncMock),
            patch("app.models.message.Message.created_at", datetime(2024, 6, 1, 10, 0, 0)),
        ):
            await handle_chat_message(
                {"conversation_id": 5, "content": "Hello!"},
                sender_id=1,
                db=db,
            )

        assert any("conversation_members.role" in query for query in query_calls)

    async def test_sender_does_not_receive_new_message_push(self):
        db = _make_chat_db(is_member=True, member_ids=[1, 2])

        mgr = ConnectionManager()
        ws1 = _mock_ws()
        ws2 = _mock_ws()
        mgr.active_connections[1] = ws1
        mgr.active_connections[2] = ws2

        with (
            patch("app.api.websocket.manager", mgr),
            patch.object(db, "flush", new_callable=AsyncMock),
            patch("app.models.message.Message.created_at", datetime(2024, 6, 1, 10, 0, 0)),
        ):
            await handle_chat_message(
                {"conversation_id": 5, "content": "Hi"},
                sender_id=1,
                db=db,
            )

        # Sender's socket must NOT receive a "new_message" push
        for call_args in ws1.send_json.call_args_list:
            assert call_args[0][0].get("type") != "new_message"

    async def test_reply_to_propagated_in_confirmation_and_push(self):
        db = _make_chat_db(is_member=True, member_ids=[1, 2], has_reply_to=True)

        mgr = ConnectionManager()
        ws2 = _mock_ws()
        mgr.active_connections[2] = ws2

        with (
            patch("app.api.websocket.manager", mgr),
            patch.object(db, "flush", new_callable=AsyncMock),
            patch("app.models.message.Message.created_at", datetime(2024, 6, 1, 10, 0, 0)),
        ):
            result = await handle_chat_message(
                {"conversation_id": 5, "content": "Reply!", "reply_to": 42},
                sender_id=1,
                db=db,
            )

        assert result["data"]["reply_to"] == 42
        push = ws2.send_json.call_args[0][0]
        assert push["data"]["reply_to"] == 42

    async def test_chat_message_restores_hidden_window(self):
        """测试发新消息时，会自动将相关人员的 is_hidden 设为 False 唤醒聊天框"""
        db = _make_chat_db(is_member=True, member_ids=[1, 2])
        mgr = ConnectionManager()
        
        with (
            patch("app.api.websocket.manager", mgr),
            patch.object(db, "flush", new_callable=AsyncMock),
            patch("app.models.message.Message.created_at", datetime(2024, 6, 1, 10, 0, 0)),
        ):
            await handle_chat_message(
                {"conversation_id": 5, "content": "Wake up the hidden chat!"},
                sender_id=1,
                db=db,
            )
            
        # 验证 db.execute 是否被调用执行了 update 语句（判断是否触发了唤醒）
        update_calls = [
            call_args for call_args in db.execute.call_args_list
            if "Update" in str(type(call_args[0][0]))
        ]
        assert len(update_calls) == 1, "应该有且仅有一次 update 语句调用来解除隐藏"

# ─── WebSocket endpoint integration tests ────────────────────────────────────

class TestWebSocketEndpoint:
    """Integration tests that exercise the full websocket_chat endpoint
    using Starlette's synchronous TestClient.  DB and lifespan are patched
    out; only the WebSocket protocol layer is real.
    """

    def test_connection_rejected_for_disallowed_origin(self):
        db = AsyncMock()
        with _ws_client(db) as client:
            with pytest.raises(WebSocketDisconnect) as exc_info:
                with client.websocket_connect(
                    "/ws/chat?token=anytoken",
                    headers={"origin": "https://evil.attacker.com"},
                ):
                    pass
            assert exc_info.value.code == 4003

    def test_connection_rejected_for_invalid_token(self):
        db = AsyncMock()
        with _ws_client(db) as client:
            with pytest.raises(WebSocketDisconnect) as exc_info:
                with client.websocket_connect(
                    "/ws/chat?token=not.a.valid.jwt",
                    headers={"origin": "http://localhost:3000"},
                ):
                    pass
            assert exc_info.value.code == 1008

    def test_ping_receives_pong(self):
        db = AsyncMock()
        r_offline = MagicMock()
        r_offline.all.return_value = []  # 无会话，不推送
        db.execute.return_value = r_offline
        with _ws_client(db) as client:
            token = _valid_token(user_id=1)
            with client.websocket_connect(
                f"/ws/chat?token={token}",
                headers={"origin": "http://localhost:3000"},
            ) as ws:
                ws.send_json({"type": "ping"})
                data = ws.receive_json()
            assert data == {"type": "pong"}

    def test_read_receipt_triggers_db_update(self):
        db = AsyncMock()
        db.execute.return_value = MagicMock()

        with _ws_client(db) as client:
            token = _valid_token(user_id=1)
            with client.websocket_connect(
                f"/ws/chat?token={token}",
                headers={"origin": "http://localhost:3000"},
            ) as ws:
                ws.send_json({
                    "type": "read_receipt",
                    "data": {
                        "conversation_id": 10,
                        "last_read_msg_id": 99,
                    },
                })
                # Follow with a ping to confirm the connection is still alive
                # and the server processed the previous message.
                ws.send_json({"type": "ping"})
                pong = ws.receive_json()

        assert pong == {"type": "pong"}
        db.execute.assert_awaited()
        db.commit.assert_awaited()

    def test_chat_message_returns_message_sent_confirmation(self):
        db = AsyncMock()
        db.add = MagicMock()

        r_conv = MagicMock()
        r_conv.scalar_one_or_none.return_value = MagicMock(spec=Conversation, type="private")

        r1 = MagicMock()
        r1.scalar_one_or_none.return_value = MagicMock(spec=ConversationMember)

        r3 = MagicMock()
        r3.all.return_value = [(1,), (2,)]  # private conversation

        # r4：User.is_active
        from collections import namedtuple
        UserStatus = namedtuple('UserStatus', ['user_id', 'is_active'])
        r4 = MagicMock()
        r4.all.return_value = [UserStatus(1, True), UserStatus(2, True), UserStatus(2, True)]

        r_frd = MagicMock()
        r_frd.scalar_one_or_none.return_value = MagicMock(spec=Friendship)

        r_frd = MagicMock()
        r_frd.scalar_one_or_none.return_value = MagicMock(spec=Friendship)


        sender = MagicMock(spec=User)
        sender.nickname = "Tester"
        sender.username = "tester"
        sender.avatar_url = None
        r5 = MagicMock()
        r5.scalar_one_or_none.return_value = sender
        r_update = MagicMock()

        r_fallback = MagicMock()
        r_fallback.scalar_one_or_none.return_value = sender
        r_fallback.all.return_value = []

        db.execute.side_effect = [r_conv, r1, r3, r4, r_frd, r5, r_update, r_fallback]

        with _ws_client(db) as client, \
            patch("app.api.websocket.push_offline_messages", new_callable=AsyncMock), \
            patch.object(db, "flush", new_callable=AsyncMock), \
            patch("app.models.message.Message.created_at", datetime(2024, 6, 1, 10, 0, 0)):
            token = _valid_token(user_id=1)
            with client.websocket_connect(
                f"/ws/chat?token={token}",
                headers={"origin": "http://localhost:3000"},
            ) as ws:
                ws.send_json({
                    "type": "chat_message",
                    "data": {
                        "conversation_id": 5,
                        "content": "Hello from test!",
                        "temp_id": 1323546434,
                    },
                })
                response = ws.receive_json()

        assert response["type"] == "message_sent"
        assert response["data"]["conversation_id"] == 5
        assert response["data"]["temp_id"] == 1323546434

    def test_chat_message_error_on_non_member(self):
        db = AsyncMock()

        r1 = MagicMock()
        r1.scalar_one_or_none.return_value = None  # not a member

        r_conv = MagicMock()
        r_conv.scalar_one_or_none.return_value = MagicMock(spec=Conversation)

        db.execute.side_effect = [r1, r_conv]

        with _ws_client(db) as client:
            token = _valid_token(user_id=1)
            with client.websocket_connect(
                f"/ws/chat?token={token}",
                headers={"origin": "http://localhost:3000"},
            ) as ws:
                ws.send_json({
                    "type": "chat_message",
                    "data": {
                        "conversation_id": 5,
                        "content": "I should not be here",
                    },
                })
                error_resp = ws.receive_json()

        assert error_resp["type"] == "error"
        assert error_resp["data"] == {"message":"不在该会话中"}
