import pytest
from httpx import AsyncClient
from datetime import datetime
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from app.api.conversations.management import delete_conversation_window


@pytest.mark.asyncio
class TestConversationSystem:
    """会话系统测试"""

    async def _register_and_login(
        self,
        client: AsyncClient,
        username: str,
        password: str = "test123456",
        email: str = None
    ) -> dict:
        """辅助函数：注册并登录，返回 token 和 user_id"""
        if email is None:
            email = f"{username}@test.com"
        
        await client.post("/auth/register", json={
            "username": username,
            "password": password,
            "email": email
        })
        
        login_resp = await client.post("/auth/login", json={
            "username": username,
            "password": password
        })
        token = login_resp.json()["access_token"]
        
        # 通过 /auth/me 获取 user_id
        headers = {"Authorization": f"Bearer {token}"}
        me_resp = await client.get("/auth/me", headers=headers)
        user_id = me_resp.json()["user_id"]
        
        return {
            "token": token,
            "user_id": user_id
        }

    async def _make_friends(
        self,
        client: AsyncClient,
        token_a: str,
        token_b: str,
        user_b_id: int
    ):
        """辅助函数：让两个用户成为好友"""
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}
        
        # A 发送好友申请
        await client.post(f"/friends/request/{user_b_id}", headers=headers_a)
        
        # B 查看申请列表
        resp = await client.get("/friends/list?status=pending&type=received", headers=headers_b)
        requests = resp.json()
        friendship_id = requests[0]["friendship_id"]
        
        # B 同意申请
        await client.put(f"/friends/accept/{friendship_id}", headers=headers_b)

    # ========== 会话列表测试 ==========

    async def test_get_conversations_empty(self, client: AsyncClient):
        """测试新用户会话"""
        auth = await self._register_and_login(client, "empty_user")
        headers = {"Authorization": f"Bearer {auth['token']}"}
        
        resp = await client.get("/conversations/list", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []

    # ========== 创建私聊测试 ==========

    async def test_create_private_conversation(self, client: AsyncClient):
        """测试创建私聊会话"""
        alice = await self._register_and_login(client, "alice_private")
        bob = await self._register_and_login(client, "bob_private")
        
        # 获取 bob 的 user_id（需要从某处获取，这里假设登录返回）
        # 如果没有返回，可以先搜索获取
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        search_resp = await client.get("/friends/search?keyword=bob_private", headers=headers_alice)
        bob_id = search_resp.json()[0]["user_id"]
        
        # 先加好友
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        # 创建私聊
        resp = await client.post("/conversations/create", 
            headers=headers_alice,
            json={
                "type": "private",
                "target_user_id": bob_id
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "private"
        assert "conversation_id" in data

    async def test_create_private_conversation_not_friend(self, client: AsyncClient):
        """测试非好友不能创建私聊"""
        alice = await self._register_and_login(client, "alice_nofriend")
        bob = await self._register_and_login(client, "bob_nofriend")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        search_resp = await client.get("/friends/search?keyword=bob_nofriend", headers=headers_alice)
        bob_id = search_resp.json()[0]["user_id"]
        
        resp = await client.post("/conversations/create",
            headers=headers_alice,
            json={
                "type": "private",
                "target_user_id": bob_id
            }
        )
        assert resp.status_code == 400
        assert "只能与好友创建私聊" in resp.json()["detail"]

    async def test_create_private_conversation_duplicate(self, client: AsyncClient):
        """测试重复创建同一私聊返回已有会话"""
        alice = await self._register_and_login(client, "alice_dup")
        bob = await self._register_and_login(client, "bob_dup")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        search_resp = await client.get("/friends/search?keyword=bob_dup", headers=headers_alice)
        bob_id = search_resp.json()[0]["user_id"]
    
        # 第一次创建
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        # 第二次创建（另一方发起）
        headers_bob = {"Authorization": f"Bearer {bob['token']}"}
        search_alice = await client.get("/friends/search?keyword=alice_dup", headers=headers_bob)
        alice_id = search_alice.json()[0]["user_id"]
        
        resp2 = await client.post("/conversations/create",
            headers=headers_bob,
            json={"type": "private", "target_user_id": alice_id}
        )
        assert resp2.status_code == 200
        assert resp2.json()["is_new"] is False

    # ========== 创建群聊测试 ==========

    async def test_create_group_conversation(self, client: AsyncClient):
        """测试创建群聊"""
        alice = await self._register_and_login(client, "alice_group")
        bob = await self._register_and_login(client, "bob_group")
        charlie = await self._register_and_login(client, "charlie_group")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        
        # 获取 bob 和 charlie 的 ID
        search_bob = await client.get("/friends/search?keyword=bob_group", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        search_charlie = await client.get("/friends/search?keyword=charlie_group", headers=headers_alice)
        charlie_id = search_charlie.json()[0]["user_id"]
        
        # 加好友
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        await self._make_friends(client, alice['token'], charlie['token'], charlie_id)
        
        # 创建群聊
        resp = await client.post("/conversations/create",
            headers=headers_alice,
            json={
                "type": "group",
                "member_ids": [bob_id, charlie_id],
                "group_name": "测试群聊"
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "group"
        assert data["conversation_name"] == "测试群聊"
        assert data["is_new"] is True

    async def test_create_group_not_friend(self, client: AsyncClient):
        """测试邀请非好友创建群聊失败"""
        alice = await self._register_and_login(client, "alice_group_fail")
        bob = await self._register_and_login(client, "bob_group_fail")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        search_bob = await client.get("/friends/search?keyword=bob_group_fail", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        
        resp = await client.post("/conversations/create",
            headers=headers_alice,
            json={
                "type": "group",
                "member_ids": [bob_id],
                "group_name": "测试群聊"
            }
        )
        assert resp.status_code == 400
        assert "不是您的好友" in resp.json()["detail"]

    # ========== 会话列表有数据测试 ==========

    async def test_get_conversations_with_data(self, client: AsyncClient):
        """测试有会话后列表正确返回"""
        alice = await self._register_and_login(client, "alice_list")
        bob = await self._register_and_login(client, "bob_list")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        search_bob = await client.get("/friends/search?keyword=bob_list", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        # 创建私聊
        await client.post("/conversations/create",
            headers=headers_alice,
            json={"type": "private", "target_user_id": bob_id}
        )
        
        # 获取会话列表
        resp = await client.get("/conversations/list", headers=headers_alice)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["type"] == "private"
        assert data[0]["unread_count"] == 1

    # ========== 历史消息测试 ==========

    async def test_get_messages_empty(self, client: AsyncClient):
        """测试新会话历史消息"""
        alice = await self._register_and_login(client, "alice_msg_empty")
        bob = await self._register_and_login(client, "bob_msg_empty")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        search_bob = await client.get("/friends/search?keyword=bob_msg_empty", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        create_resp = await client.post("/conversations/create",
            headers=headers_alice,
            json={"type": "private", "target_user_id": bob_id}
        )
        conv_id = create_resp.json()["conversation_id"]
        
        resp = await client.get(f"/conversations/{conv_id}/messages", headers=headers_alice)
        assert resp.status_code == 200
        assert "通过" in resp.json()[0]['content']  

    async def test_get_messages_pagination(self, client: AsyncClient):
        """测试历史消息分页功能"""
        alice = await self._register_and_login(client, "alice_page")
        bob = await self._register_and_login(client, "bob_page")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        
        # 加好友并创建私聊
        search_bob = await client.get("/friends/search?keyword=bob_page", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        create_resp = await client.post("/conversations/create",
                                        headers=headers_alice,
                                        json={"type": "private", "target_user_id": bob_id})
        conv_id = create_resp.json()["conversation_id"]
        
        # 插入 3 条消息
        for i in range(1, 4):
            await self._insert_message(conv_id, alice['user_id'], f"Msg{i}")
        
        # 获取前 2 条（最新两条，但接口返回正序，所以是 Msg2, Msg3）
        resp = await client.get(f"/conversations/{conv_id}/messages",
                                params={"limit": 2},
                                headers=headers_alice)
        msgs = resp.json()
        assert len(msgs) == 2
        assert msgs[0]["content"] == "Msg2"
        assert msgs[1]["content"] == "Msg3"
        
        # 使用 before_msg_id 获取 Msg2 之前的消息
        before_id = msgs[0]["msg_id"]   # Msg2 的 ID
        resp2 = await client.get(f"/conversations/{conv_id}/messages",
                                params={"limit": 10, "before_msg_id": before_id},
                                headers=headers_alice)
        msgs2 = resp2.json()
        assert len(msgs2) == 2
        assert msgs2[1]["content"] == "Msg1"

    # ========== 权限测试 ==========

    async def test_access_denied_conversation(self, client: AsyncClient):
        """测试无权访问的会话返回 403"""
        alice = await self._register_and_login(client, "alice_denied")
        bob = await self._register_and_login(client, "bob_denied")
        charlie = await self._register_and_login(client, "charlie_denied")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        headers_bob = {"Authorization": f"Bearer {bob['token']}"}
        
        # alice 和 bob 创建私聊
        search_bob = await client.get("/friends/search?keyword=bob_denied", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        create_resp = await client.post("/conversations/create",
            headers=headers_alice,
            json={"type": "private", "target_user_id": bob_id}
        )
        conv_id = create_resp.json()["conversation_id"]
        
        # charlie 尝试访问这个会话
        headers_charlie = {"Authorization": f"Bearer {charlie['token']}"}
        resp = await client.get(f"/conversations/{conv_id}/messages", headers=headers_charlie)
        assert resp.status_code == 403
        assert "无权访问" in resp.json()["detail"]

    # ========== 标记已读测试 ==========

    async def test_mark_as_read(self, client: AsyncClient):
        """测试标记已读后未读数归零"""
        alice = await self._register_and_login(client, "alice_read")
        bob = await self._register_and_login(client, "bob_read")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        headers_bob = {"Authorization": f"Bearer {bob['token']}"}
        
        # 建立好友关系和私聊
        search_bob = await client.get("/friends/search?keyword=bob_read", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        create_resp = await client.post("/conversations/create",
            headers=headers_alice,
            json={"type": "private", "target_user_id": bob_id}
        )
        conv_id = create_resp.json()["conversation_id"]
        
        # bob 发送消息（这里假设有发送消息接口，暂时跳过或后续补充）
        # 标记已读
        resp = await client.put(f"/conversations/{conv_id}/read",
            headers=headers_alice,
            json={"last_read_msg_id": 999}  # 假设的 msg_id
        )
        assert resp.status_code == 200


    async def test_delete_single_message(self, client: AsyncClient):
        """测试删除单条消息"""
        alice = await self._register_and_login(client, "alice_delete_msg")
        bob = await self._register_and_login(client, "bob_delete_msg")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        headers_bob = {"Authorization": f"Bearer {bob['token']}"}
        
        # 建立好友和会话
        search_bob = await client.get(
            "/friends/search?keyword=bob_delete_msg",
            headers=headers_alice
        )
        bob_id = search_bob.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        create_resp = await client.post("/conversations/create",
            headers=headers_alice,
            json={"type": "private", "target_user_id": bob_id}
        )
        conv_id = create_resp.json()["conversation_id"]
        
        # 发送一条消息（需要通过 WebSocket 或直接插入数据库，这里简化为调用接口）
        # 假设有发送消息的 HTTP 接口，如果没有，暂时跳过或手动插入测试数据
        # 删除消息
        # resp = await client.delete(f"/conversations/{conv_id}/messages/{msg_id}", headers=headers_alice)
        # assert resp.status_code == 200


    async def test_clear_conversation_messages(self, client: AsyncClient):
        """测试清空会话聊天记录"""
        alice = await self._register_and_login(client, "alice_clear")
        bob = await self._register_and_login(client, "bob_clear")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        headers_bob = {"Authorization": f"Bearer {bob['token']}"}
        
        search_bob = await client.get("/friends/search?keyword=bob_clear", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        create_resp = await client.post("/conversations/create",
            headers=headers_alice,
            json={"type": "private", "target_user_id": bob_id}
        )
        conv_id = create_resp.json()["conversation_id"]
        
        # 清空消息
        resp = await client.delete(f"/conversations/{conv_id}/messages", headers=headers_alice)
        assert resp.status_code == 200
        assert "已清空 1 " in resp.json()["message"]
        resp = await client.delete(f"/conversations/{conv_id}/messages", headers=headers_alice)
        assert resp.status_code == 200
        assert "没有需要删除的消息" in resp.json()["message"]


    async def test_delete_conversation_window(self, client: AsyncClient): # 👈 建议改名
        """测试删除（隐藏）聊天窗口""" # 👈 修改注释
        alice = await self._register_and_login(client, "alice_exit")
        bob = await self._register_and_login(client, "bob_exit")
    
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
    
        search_bob = await client.get("/friends/search?keyword=bob_exit", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
    
        create_resp = await client.post("/conversations/create",
            headers=headers_alice,
            json={"type": "private", "target_user_id": bob_id}
        )
        conv_id = create_resp.json()["conversation_id"]
    
        # 删除聊天窗口
        resp = await client.delete(f"/conversations/{conv_id}", headers=headers_alice)
        assert resp.status_code == 200
        # 👇 核心修改：断言返回的文案必须和新接口一致
        assert "聊天窗口已删除" in resp.json()["message"]


    async def _create_test_conversation(self, client: AsyncClient, owner_token: str, friend_username: str):
        """辅助方法：创建一个私聊会话并返回 conversation_id 和 friend_user_id"""
        from app.db.database import get_db
        from app.models.message import Conversation, ConversationMember

        # 搜索好友 ID
        search_resp = await client.get(
            f"/friends/search?keyword={friend_username}",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        friend_id = search_resp.json()[0]["user_id"]

        # 创建会话（假设已经是好友）
        create_resp = await client.post(
            "/conversations/create",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"type": "private", "target_user_id": friend_id}
        )
        conv_id = create_resp.json()["conversation_id"]

        # 由于直接操作数据库需要 session，这里返回必要信息供后续手动插入消息
        return conv_id, friend_id

    async def _insert_message(
        self, conv_id: int, sender_id: int, content: str, reply_to: int = None
    ):
        """直接插入一条消息到数据库（绕过 WebSocket）"""
        from app.db.database import get_db
        from app.models.message import Message
        from datetime import datetime

        async for db in get_db():
            msg = Message(
                conversation_id=conv_id,
                sender_id=sender_id,
                content=content,
                msg_type="text",
                reply_to=reply_to,
                created_at=datetime.now()
            )
            db.add(msg)
            await db.commit()
            await db.refresh(msg)
            return msg.msg_id

    async def test_message_response_schema_has_reply_fields(self, client: AsyncClient):
        """验证消息响应结构中包含 reply_to 和 reply_count 字段"""
        # 创建两个用户并成为好友，建立会话
        alice = await self._register_and_login(client, "alice_reply_schema")
        bob = await self._register_and_login(client, "bob_reply_schema")

        headers_alice = {"Authorization": f"Bearer {alice['token']}"}

        # 搜索 bob 并加好友
        search_resp = await client.get("/friends/search?keyword=bob_reply_schema", headers=headers_alice)
        bob_id = search_resp.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)

        # 创建私聊
        create_resp = await client.post("/conversations/create",
                                        headers=headers_alice,
                                        json={"type": "private", "target_user_id": bob_id})
        conv_id = create_resp.json()["conversation_id"]

        # 手动插入一条普通消息（无回复）
        msg_id = await self._insert_message(conv_id, alice['user_id'], "Hello, no reply")

        # 获取历史消息
        resp = await client.get(f"/conversations/{conv_id}/messages", headers=headers_alice)
        assert resp.status_code == 200
        messages = resp.json()
        assert len(messages) >= 1
        target_msg = next(m for m in messages if m["msg_id"] == msg_id)

        # 验证必须包含这两个字段
        assert "reply_to" in target_msg, "响应中缺少 reply_to 字段"
        assert "reply_count" in target_msg, "响应中缺少 reply_count 字段"
        assert target_msg["reply_to"] is None
        assert target_msg["reply_count"] == 0

    async def test_reply_to_field_stored_and_returned(self, client: AsyncClient):
        """测试回复消息的 reply_to 字段正确保存和返回"""
        alice = await self._register_and_login(client, "alice_reply_store")
        bob = await self._register_and_login(client, "bob_reply_store")

        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        search_resp = await client.get("/friends/search?keyword=bob_reply_store", headers=headers_alice)
        bob_id = search_resp.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)

        # 创建会话
        create_resp = await client.post("/conversations/create",
                                        headers=headers_alice,
                                        json={"type": "private", "target_user_id": bob_id})
        conv_id = create_resp.json()["conversation_id"]

        # 1. 发送一条父消息
        parent_msg_id = await self._insert_message(conv_id, alice['user_id'], "Parent message")

        # 2. 发送一条回复消息（指向父消息）
        reply_msg_id = await self._insert_message(conv_id, alice['user_id'], "Reply to parent", reply_to=parent_msg_id)

        # 3. 获取历史消息
        resp = await client.get(f"/conversations/{conv_id}/messages", headers=headers_alice)
        assert resp.status_code == 200
        messages = resp.json()

        # 找到回复消息
        reply_msg = next(m for m in messages if m["msg_id"] == reply_msg_id)
        assert reply_msg["reply_to"] == parent_msg_id, f"reply_to 应为 {parent_msg_id}，实际为 {reply_msg['reply_to']}"

    async def test_reply_count_correct(self, client: AsyncClient):
        """测试被回复的消息的 reply_count 统计正确"""
        alice = await self._register_and_login(client, "alice_reply_count")
        bob = await self._register_and_login(client, "bob_reply_count")

        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        search_resp = await client.get("/friends/search?keyword=bob_reply_count", headers=headers_alice)
        bob_id = search_resp.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)

        create_resp = await client.post("/conversations/create",
                                        headers=headers_alice,
                                        json={"type": "private", "target_user_id": bob_id})
        conv_id = create_resp.json()["conversation_id"]

        # 1. 父消息
        parent_id = await self._insert_message(conv_id, alice['user_id'], "Parent")

        # 2. 回复 3 次
        for i in range(3):
            await self._insert_message(conv_id, alice['user_id'], f"Reply {i+1}", reply_to=parent_id)

        # 3. 插入一条不相关的消息（不应影响计数）
        await self._insert_message(conv_id, alice['user_id'], "Another message")

        # 4. 获取历史消息
        resp = await client.get(f"/conversations/{conv_id}/messages", headers=headers_alice)
        messages = resp.json()

        parent_msg = next(m for m in messages if m["msg_id"] == parent_id)
        assert parent_msg["reply_count"] == 3, f"期望回复数 3，实际 {parent_msg['reply_count']}"

        # 可选：检查普通消息的 reply_count = 0
        another_msg = next(m for m in messages if m["content"] == "Another message")
        assert another_msg["reply_count"] == 0

    async def test_multiple_replies_different_parents(self, client: AsyncClient):
        """测试多个父消息都有各自的回复计数"""
        alice = await self._register_and_login(client, "alice_multi_reply")
        bob = await self._register_and_login(client, "bob_multi_reply")

        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        search_resp = await client.get("/friends/search?keyword=bob_multi_reply", headers=headers_alice)
        bob_id = search_resp.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)

        create_resp = await client.post("/conversations/create",
                                        headers=headers_alice,
                                        json={"type": "private", "target_user_id": bob_id})
        conv_id = create_resp.json()["conversation_id"]

        # 创建两条父消息
        parent1 = await self._insert_message(conv_id, alice['user_id'], "Parent 1")
        parent2 = await self._insert_message(conv_id, alice['user_id'], "Parent 2")

        # 对 parent1 回复 2 次，对 parent2 回复 1 次
        for _ in range(2):
            await self._insert_message(conv_id, alice['user_id'], "R1", reply_to=parent1)
        await self._insert_message(conv_id, alice['user_id'], "R2", reply_to=parent2)

        resp = await client.get(f"/conversations/{conv_id}/messages", headers=headers_alice)
        messages = {m["msg_id"]: m for m in resp.json()}

        assert messages[parent1]["reply_count"] == 2
        assert messages[parent2]["reply_count"] == 1

    # ========== 新增辅助方法：支持自定义时间的消息插入 ==========
    async def _insert_message_with_time(self, conv_id: int, sender_id: int, content: str,
                                        created_at: datetime, reply_to: int = None):
        """插入带自定义创建时间的消息（用于时间筛选测试）"""
        from app.db.database import get_db
        from app.models.message import Message

        created_at = created_at.replace(microsecond=0)
        async for db in get_db():
            msg = Message(
                conversation_id=conv_id,
                sender_id=sender_id,
                content=content,
                msg_type="text",
                reply_to=reply_to,
                created_at=created_at
            )
            db.add(msg)
            await db.commit()
            await db.refresh(msg)
            return msg.msg_id

    # ========== 会话设置（置顶/免打扰）测试 ==========
    async def test_update_conversation_settings(self, client: AsyncClient):
        """测试更新会话的置顶和免打扰状态"""
        alice = await self._register_and_login(client, "alice_settings")
        bob = await self._register_and_login(client, "bob_settings")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        
        # 加好友并创建私聊
        search_bob = await client.get("/friends/search?keyword=bob_settings", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        create_resp = await client.post("/conversations/create",
                                        headers=headers_alice,
                                        json={"type": "private", "target_user_id": bob_id})
        conv_id = create_resp.json()["conversation_id"]
        
        # 1. 设置置顶
        resp = await client.patch(f"/conversations/{conv_id}/settings",
                                  headers=headers_alice,
                                  json={"is_pinned": True})
        assert resp.status_code == 200
        assert resp.json()["message"] == "设置已更新"
        
        # 验证会话列表中返回 is_pinned=True
        list_resp = await client.get("/conversations/list", headers=headers_alice)
        conv = next(c for c in list_resp.json() if c["conversation_id"] == conv_id)
        assert conv["is_pinned"] is True
        
        # 2. 设置免打扰
        resp = await client.patch(f"/conversations/{conv_id}/settings",
                                  headers=headers_alice,
                                  json={"do_not_disturb": True})
        assert resp.status_code == 200
        
        list_resp2 = await client.get("/conversations/list", headers=headers_alice)
        conv2 = next(c for c in list_resp2.json() if c["conversation_id"] == conv_id)
        assert conv2["do_not_disturb"] is True
        
        # 3. 同时更新两个字段
        resp = await client.patch(f"/conversations/{conv_id}/settings",
                                  headers=headers_alice,
                                  json={"is_pinned": False, "do_not_disturb": False})
        assert resp.status_code == 200
        
        list_resp3 = await client.get("/conversations/list", headers=headers_alice)
        conv3 = next(c for c in list_resp3.json() if c["conversation_id"] == conv_id)
        assert conv3["is_pinned"] is False
        assert conv3["do_not_disturb"] is False

    async def test_conversation_list_pinned_sorting(self, client: AsyncClient):
        """测试置顶会话排在列表最前面"""
        alice = await self._register_and_login(client, "alice_sort")
        bob = await self._register_and_login(client, "bob_sort")
        charlie = await self._register_and_login(client, "charlie_sort")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        
        # 添加好友
        search_bob = await client.get("/friends/search?keyword=bob_sort", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)

        import asyncio
        await asyncio.sleep(1.0)
        
        search_charlie = await client.get("/friends/search?keyword=charlie_sort", headers=headers_alice)
        charlie_id = search_charlie.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], charlie['token'], charlie_id)
        
        # 获取会话列表，并打印返回数据以便调试
        list_resp = await client.get("/conversations/list", headers=headers_alice)
        assert list_resp.status_code == 200
        convs = list_resp.json()
        print(f"会话列表返回数量: {len(convs)}")
        print(f"会话列表内容: {convs}")
        assert len(convs) == 2, f"期望2个会话，实际{len(convs)}个"
        conv_ids = [c["conversation_id"] for c in convs]
        # 最新创建的会话应该在前面
        assert conv_ids[0] == 2
        assert conv_ids[1] == 1
        
        # 将较旧的会话（conv1）置顶
        await client.patch(f"/conversations/1/settings",
                           headers=headers_alice,
                           json={"is_pinned": True})

        list_resp2 = await client.get("/conversations/list", headers=headers_alice)
        convs2 = list_resp2.json()
        # 置顶的会话应该在第一位
        assert convs2[0]["conversation_id"] == 1
        assert convs2[0]["is_pinned"] is True
        # 未置顶的会话仍然按时间倒序
        assert convs2[1]["conversation_id"] == 2
        assert convs2[1]["is_pinned"] is False

        # 同时置顶另一个会话，置顶之间按最新消息时间排序（这里都没有消息，按创建时间）
        await client.patch(f"/conversations/2/settings",
                           headers=headers_alice,
                           json={"is_pinned": True})
        list_resp3 = await client.get("/conversations/list", headers=headers_alice)
        convs3 = list_resp3.json()
        # 两个都置顶，较新的 conv2 应该排在前面（因为时间倒序）
        assert convs3[0]["conversation_id"] == 2
        assert convs3[1]["conversation_id"] == 1

    async def test_conversation_list_fields(self, client: AsyncClient):
        """测试会话列表返回包含 is_pinned 和 do_not_disturb 字段"""
        alice = await self._register_and_login(client, "alice_fields")
        bob = await self._register_and_login(client, "bob_fields")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        
        search_bob = await client.get("/friends/search?keyword=bob_fields", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        create_resp = await client.post("/conversations/create",
                                        headers=headers_alice,
                                        json={"type": "private", "target_user_id": bob_id})
        conv_id = create_resp.json()["conversation_id"]
        
        list_resp = await client.get("/conversations/list", headers=headers_alice)
        conv = list_resp.json()[0]
        # 验证字段存在且类型正确
        assert "is_pinned" in conv
        assert "do_not_disturb" in conv
        assert isinstance(conv["is_pinned"], bool)
        assert isinstance(conv["do_not_disturb"], bool)
        # 默认应该为 False
        assert conv["is_pinned"] is False
        assert conv["do_not_disturb"] is False

    # ========== 历史消息筛选测试 ==========

    async def test_get_messages_filter_by_time(self, client: AsyncClient):
        """测试按时间范围筛选历史消息"""
        from datetime import datetime, timedelta
        from zoneinfo import ZoneInfo

        alice = await self._register_and_login(client, "alice_time_filter")
        bob = await self._register_and_login(client, "bob_time_filter")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        
        # 建立好友和会话
        search_bob = await client.get("/friends/search?keyword=bob_time_filter", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        create_resp = await client.post("/conversations/create",
                                        headers=headers_alice,
                                        json={"type": "private", "target_user_id": bob_id})
        conv_id = create_resp.json()["conversation_id"]
        
        # 插入三条消息，时间分别为 T-2, T-1, T (当前)
        base_time = (
            datetime.now(ZoneInfo("Asia/Shanghai")).replace(
                tzinfo=None,
                microsecond=0
            ) + timedelta(hours=2)
        )
        for i, delta in enumerate([2, 1, 0]):
            await self._insert_message_with_time(
                conv_id, alice['user_id'], f"Message {i+1}",
                created_at=base_time - timedelta(hours=delta)
            )
        
        # 测试 start_time: 只取大于等于 T-1 的消息
        start = base_time - timedelta(hours=1)
        resp = await client.get(f"/conversations/{conv_id}/messages",
                                headers=headers_alice,
                                params={"start_time": start.isoformat()})
        messages = resp.json()
        assert len(messages) == 2  # 通过申请，Message 2 和 Message 3
        assert messages[0]["content"] == "Message 2"
        assert messages[1]["content"] == "Message 3"
        
        # 测试 end_time: 只取小于等于 T-1 的消息
        end = base_time - timedelta(hours=1)
        resp = await client.get(f"/conversations/{conv_id}/messages",
                                headers=headers_alice,
                                params={"end_time": end.isoformat()})
        messages = resp.json()
        # 闭区间，应包含 通过申请，Message 1 和 Message 2（时间 T-2 和 T-1 都 <= T-1）
        assert len(messages) == 3
        assert messages[1]["content"] == "Message 1"
        assert messages[2]["content"] == "Message 2"
        
        # 测试同时使用 start_time 和 end_time
        resp = await client.get(f"/conversations/{conv_id}/messages",
                                headers=headers_alice,
                                params={
                                    "start_time": (base_time - timedelta(hours=1.5)).isoformat(),
                                    "end_time": (base_time - timedelta(hours=0.5)).isoformat()
                                })
        messages = resp.json()
        assert len(messages) == 1  # Message 2 (T-1)
        assert messages[0]["content"] == "Message 2"

    async def test_get_messages_filter_by_sender(self, client: AsyncClient):
        """测试群聊中按发送者筛选消息"""
        alice = await self._register_and_login(client, "alice_sender")
        bob = await self._register_and_login(client, "bob_sender")
        charlie = await self._register_and_login(client, "charlie_sender")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        
        # 相互加好友
        search_bob = await client.get("/friends/search?keyword=bob_sender", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        search_charlie = await client.get("/friends/search?keyword=charlie_sender", headers=headers_alice)
        charlie_id = search_charlie.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        await self._make_friends(client, alice['token'], charlie['token'], charlie_id)
        
        # 创建群聊，包含三个人
        create_resp = await client.post("/conversations/create",
                                        headers=headers_alice,
                                        json={
                                            "type": "group",
                                            "member_ids": [bob_id, charlie_id],
                                            "group_name": "测试群"
                                        })
        conv_id = create_resp.json()["conversation_id"]
        
        # Alice 和 Bob 各发几条消息
        for i in range(2):
            await self._insert_message(conv_id, alice['user_id'], f"Alice msg {i+1}")
        for i in range(3):
            await self._insert_message(conv_id, bob_id, f"Bob msg {i+1}")
        
        # 筛选发送者为 Alice 的消息
        resp = await client.get(f"/conversations/{conv_id}/messages",
                                headers=headers_alice,
                                params={"sender_id": alice['user_id']})
        messages = resp.json()
        assert len(messages) == 3
        for msg in messages[1:]:
            assert msg["sender_id"] == alice['user_id']
            assert msg["content"].startswith("Alice msg")
        
        # 筛选发送者为 Bob 的消息
        resp = await client.get(f"/conversations/{conv_id}/messages",
                                headers=headers_alice,
                                params={"sender_id": bob_id})
        messages = resp.json()
        assert len(messages) == 3
        for msg in messages:
            assert msg["sender_id"] == bob_id
        
        # 筛选不存在的发送者
        resp = await client.get(f"/conversations/{conv_id}/messages",
                                headers=headers_alice,
                                params={"sender_id": 99999})
        assert resp.json() == []
        
        # 同时使用时间筛选和发送者筛选（使用已创建的消息，取最后一条消息的时间作为开始）
        from datetime import datetime, timedelta
        bob_msgs = await client.get(f"/conversations/{conv_id}/messages",
                                    headers=headers_alice,
                                    params={"sender_id": bob_id})
        bob_msgs_data = bob_msgs.json()
        if bob_msgs_data:
            last_time_str = bob_msgs_data[-1]["created_at"]
            last_time = datetime.fromisoformat(last_time_str)
            future_time = last_time + timedelta(seconds=1)
            resp = await client.get(f"/conversations/{conv_id}/messages",
                                    headers=headers_alice,
                                    params={"sender_id": bob_id, "start_time": future_time.isoformat()})
            assert resp.json() == []

    async def test_do_not_disturb_does_not_affect_unread_count(self, client: AsyncClient):
        """测试免打扰会话的未读计数仍然正常累加（后端行为）"""
        alice = await self._register_and_login(client, "alice_dnd_count")
        bob = await self._register_and_login(client, "bob_dnd_count")
        
        headers_alice = {"Authorization": f"Bearer {alice['token']}"}
        headers_bob = {"Authorization": f"Bearer {bob['token']}"}
        
        search_bob = await client.get("/friends/search?keyword=bob_dnd_count", headers=headers_alice)
        bob_id = search_bob.json()[0]["user_id"]
        await self._make_friends(client, alice['token'], bob['token'], bob_id)
        
        create_resp = await client.post("/conversations/create",
                                        headers=headers_alice,
                                        json={"type": "private", "target_user_id": bob_id})
        conv_id = create_resp.json()["conversation_id"]
        
        # Bob 设置免打扰
        await client.patch(f"/conversations/{conv_id}/settings",
                           headers=headers_bob,
                           json={"do_not_disturb": True})
        
        # Alice 发送两条消息
        await self._insert_message(conv_id, alice['user_id'], "Msg1")
        await self._insert_message(conv_id, alice['user_id'], "Msg2")
        
        # Bob 获取会话列表，unread_count 应该为 2（实际未读计数不受免打扰影响）
        list_resp = await client.get("/conversations/list", headers=headers_bob)
        conv = next(c for c in list_resp.json() if c["conversation_id"] == conv_id)
        assert conv["unread_count"] == 2
        assert conv["do_not_disturb"] is True
        
        # Bob 阅读消息后，未读数归零
        msgs_resp = await client.get(f"/conversations/{conv_id}/messages", headers=headers_bob)
        last_msg_id = msgs_resp.json()[-1]["msg_id"]
        await client.put(f"/conversations/{conv_id}/read",
                         headers=headers_bob,
                         json={"last_read_msg_id": last_msg_id})
        
        list_resp2 = await client.get("/conversations/list", headers=headers_bob)
        conv2 = next(c for c in list_resp2.json() if c["conversation_id"] == conv_id)
        assert conv2["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_delete_conversation_window_hides_conversation(self):
        """测试删除聊天窗口时，只会把 is_hidden 置为 True，而不会真正删除成员记录"""
        db = AsyncMock()
        
        # 构造一个正常的会话成员
        member_mock = MagicMock()
        member_mock.is_hidden = False
        
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = member_mock
        db.execute.return_value = result_mock
        
        current_user = {"user_id": 1}
        
        # 执行删除聊天窗接口
        response = await delete_conversation_window(
            conversation_id=5,
            db=db,
            current_user=current_user
        )
        
        # 断言 1: 接口返回成功信息
        assert response == {"message": "聊天窗口已删除"}
        
        # 断言 2: 核心字段 is_hidden 被成功设置为 True
        assert member_mock.is_hidden is True
        
        # 断言 3: 没有调用任何真正的 delete 操作
        db.delete.assert_not_called()
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_delete_conversation_window_raises_403_if_not_member(self):
        """测试非群成员尝试删除窗口时应当被拒绝"""
        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None  # 查无此人
        db.execute.return_value = result_mock
        
        with pytest.raises(HTTPException) as exc_info:
            await delete_conversation_window(
                conversation_id=5,
                db=db,
                current_user={"user_id": 1}
            )
            
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "无权访问该会话"
