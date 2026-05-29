import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestFriendSystem:
    """好友系统测试"""

    async def test_search_users(self, client: AsyncClient):
        """测试搜索用户"""
        # 先注册两个用户
        await client.post("/auth/register", json={
            "username": "alice",
            "password": "abc123456",
            "email": "alice@example.com"
        })
        await client.post("/auth/register", json={
            "username": "bob",
            "password": "abc123456",
            "email": "bob@example.com"
        })

        # 用 alice 登录
        login_resp = await client.post("/auth/login", json={
            "username": "alice",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 搜索 bob
        resp = await client.get("/friends/search?keyword=bob", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["username"] == "bob"

    async def test_search_users_excludes_deactivated_users(
        self,
        client: AsyncClient
    ):
        """搜索结果应过滤已注销用户"""
        await client.post("/auth/register", json={
            "username": "search_owner",
            "password": "abc123456",
            "email": "search_owner@example.com"
        })
        await client.post("/auth/register", json={
            "username": "to_delete_user",
            "password": "abc123456",
            "email": "to_delete_user@example.com"
        })

        owner_login = await client.post("/auth/login", json={
            "username": "search_owner",
            "password": "abc123456"
        })
        owner_headers = {
            "Authorization": f"Bearer {owner_login.json()['access_token']}"
        }

        deleted_login = await client.post("/auth/login", json={
            "username": "to_delete_user",
            "password": "abc123456"
        })
        deleted_headers = {
            "Authorization": f"Bearer {deleted_login.json()['access_token']}"
        }
        delete_resp = await client.delete(
            "/auth/delete_account",
            headers=deleted_headers
        )
        assert delete_resp.status_code == 204

        resp = await client.get(
            "/friends/search?keyword=已注销用户",
            headers=owner_headers
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_send_friend_request(self, client: AsyncClient):
        """测试发送好友申请"""
        # 注册两个用户
        await client.post("/auth/register", json={
            "username": "charlie",
            "password": "abc123456",
            "email": "charlie@example.com"
        })
        await client.post("/auth/register", json={
            "username": "david",
            "password": "abc123456",
            "email": "david@example.com"
        })

        # 用 charlie 登录
        login_resp = await client.post("/auth/login", json={
            "username": "charlie",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 获取 david 的 user_id
        search_resp = await client.get("/friends/search?keyword=david", headers=headers)
        data = search_resp.json()
        assert len(data) > 0, "没有找到 david"
        david_id = data[0]["user_id"]

        # 发送好友申请
        resp = await client.post(f"/friends/request/{david_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["message"] == "好友请求已发送"

        # 重复发送应该失败
        resp2 = await client.post(f"/friends/request/{david_id}", headers=headers)
        assert resp2.status_code == 400

    async def test_send_friend_request_to_deactivated_user_fails(
        self,
        client: AsyncClient
    ):
        """向已注销用户发好友申请应失败"""
        await client.post("/auth/register", json={
            "username": "active_sender",
            "password": "abc123456",
            "email": "active_sender@example.com"
        })
        await client.post("/auth/register", json={
            "username": "deactivated_target",
            "password": "abc123456",
            "email": "deactivated_target@example.com"
        })

        sender_login = await client.post("/auth/login", json={
            "username": "active_sender",
            "password": "abc123456"
        })
        sender_headers = {
            "Authorization": f"Bearer {sender_login.json()['access_token']}"
        }

        target_login = await client.post("/auth/login", json={
            "username": "deactivated_target",
            "password": "abc123456"
        })
        target_token = target_login.json()["access_token"]
        target_headers = {"Authorization": f"Bearer {target_token}"}
        target_profile = await client.get("/auth/me", headers=target_headers)
        target_user_id = target_profile.json()["user_id"]

        delete_resp = await client.delete(
            "/auth/delete_account",
            headers=target_headers
        )
        assert delete_resp.status_code == 204

        request_resp = await client.post(
            f"/friends/request/{target_user_id}",
            headers=sender_headers
        )
        assert request_resp.status_code == 400
        assert request_resp.json()["detail"] == "该用户已注销"

    async def test_accept_friend_request(self, client: AsyncClient):
        """测试同意好友申请"""
        # 注册两个用户
        await client.post("/auth/register", json={
            "username": "eve",
            "password": "abc123456",
            "email": "eve@example.com"
        })
        await client.post("/auth/register", json={
            "username": "frank",
            "password": "abc123456",
            "email": "frank@example.com"
        })

        # eve 登录
        login_resp = await client.post("/auth/login", json={
            "username": "eve",
            "password": "abc123456"
        })
        eve_token = login_resp.json()["access_token"]
        eve_headers = {"Authorization": f"Bearer {eve_token}"}

        # frank 登录
        login_resp = await client.post("/auth/login", json={
            "username": "frank",
            "password": "abc123456"
        })
        frank_token = login_resp.json()["access_token"]
        frank_headers = {"Authorization": f"Bearer {frank_token}"}

        # eve 搜索 frank 并发送好友申请
        search_resp = await client.get("/friends/search?keyword=frank", headers=eve_headers)
        data = search_resp.json()
        assert len(data) > 0, "没有找到 frank"
        frank_id = data[0]["user_id"]
        await client.post(f"/friends/request/{frank_id}", headers=eve_headers)

        # frank 查看好友申请列表（status=pending, type=received）
        pending_resp = await client.get("/friends/list?status=pending&type=received", headers=frank_headers)
        assert pending_resp.status_code == 200
        pending_list = pending_resp.json()
        assert len(pending_list) == 1

        # frank 同意申请（使用 friendship_id）
        friendship_id = pending_list[0]["friendship_id"]
        accept_resp = await client.put(f"/friends/accept/{friendship_id}", headers=frank_headers)
        assert accept_resp.status_code == 200
        assert accept_resp.json()["message"] == "已添加好友"

        # 验证好友关系已建立 - 使用 type=all 查询所有好友
        friends_resp = await client.get("/friends/list?type=all&status=accepted", headers=frank_headers)
        assert friends_resp.status_code == 200
        friends_list = friends_resp.json()
        assert len(friends_list) == 1
        assert friends_list[0]["username"] == "eve"

        # 验证 eve 也能看到 frank
        friends_resp_eve = await client.get("/friends/list?type=all&status=accepted", headers=eve_headers)
        assert friends_resp_eve.status_code == 200
        friends_list_eve = friends_resp_eve.json()
        assert len(friends_list_eve) == 1
        assert friends_list_eve[0]["username"] == "frank"

    async def test_reject_friend_request(self, client: AsyncClient):
        """测试拒绝好友申请"""
        # 注册两个用户
        await client.post("/auth/register", json={
            "username": "ivan",
            "password": "abc123456",
            "email": "ivan@example.com"
        })
        await client.post("/auth/register", json={
            "username": "judy",
            "password": "abc123456",
            "email": "judy@example.com"
        })

        # ivan 登录
        login_resp = await client.post("/auth/login", json={
            "username": "ivan",
            "password": "abc123456"
        })
        ivan_token = login_resp.json()["access_token"]
        ivan_headers = {"Authorization": f"Bearer {ivan_token}"}

        # judy 登录
        login_resp = await client.post("/auth/login", json={
            "username": "judy",
            "password": "abc123456"
        })
        judy_token = login_resp.json()["access_token"]
        judy_headers = {"Authorization": f"Bearer {judy_token}"}

        # ivan 搜索 judy 并发送好友申请
        search_resp = await client.get("/friends/search?keyword=judy", headers=ivan_headers)
        judy_id = search_resp.json()[0]["user_id"]
        await client.post(f"/friends/request/{judy_id}", headers=ivan_headers)

        # judy 查看好友申请列表
        pending_resp = await client.get("/friends/list?status=pending&type=received", headers=judy_headers)
        pending_list = pending_resp.json()
        assert len(pending_list) == 1

        # judy 拒绝申请（使用 DELETE 接口）
        friendship_id = pending_list[0]["friendship_id"]
        reject_resp = await client.delete(f"/friends/{friendship_id}", headers=judy_headers)
        assert reject_resp.status_code == 200
        assert reject_resp.json()["message"] == "已拒绝好友关系"

        # 验证好友关系已被删除
        list_resp = await client.get("/friends/list?type=received&status=pending", headers=judy_headers)
        assert list_resp.status_code == 200
        assert len(list_resp.json()) == 0

    async def test_get_friends_list(self, client: AsyncClient):
        """测试获取好友列表的各种场景"""
        # 注册两个用户
        await client.post("/auth/register", json={
            "username": "grace",
            "password": "abc123456",
            "email": "grace@example.com"
        })
        await client.post("/auth/register", json={
            "username": "henry",
            "password": "abc123456",
            "email": "henry@example.com"
        })

        # grace 登录
        login_resp = await client.post("/auth/login", json={
            "username": "grace",
            "password": "abc123456"
        })
        grace_token = login_resp.json()["access_token"]
        grace_headers = {"Authorization": f"Bearer {grace_token}"}

        # henry 登录
        login_resp = await client.post("/auth/login", json={
            "username": "henry",
            "password": "abc123456"
        })
        henry_token = login_resp.json()["access_token"]
        henry_headers = {"Authorization": f"Bearer {henry_token}"}

        # grace 搜索 henry 并发送好友申请
        search_resp = await client.get("/friends/search?keyword=henry", headers=grace_headers)
        henry_id = search_resp.json()[0]["user_id"]
        await client.post(f"/friends/request/{henry_id}", headers=grace_headers)

        # 测试查询发送的请求（type=sent, status=pending）
        sent_resp = await client.get("/friends/list?type=sent&status=pending", headers=grace_headers)
        assert sent_resp.status_code == 200
        sent_list = sent_resp.json()
        assert len(sent_list) == 1
        assert sent_list[0]["username"] == "henry"
        assert sent_list[0]["status"] == "pending"

        # 测试查询发送的所有请求（type=sent, status=all）
        sent_all_resp = await client.get("/friends/list?type=sent&status=all", headers=grace_headers)
        assert sent_all_resp.status_code == 200
        sent_all_list = sent_all_resp.json()
        assert len(sent_all_list) == 1

        # 测试查询收到的请求（type=received, status=pending）
        received_resp = await client.get("/friends/list?type=received&status=pending", headers=henry_headers)
        assert received_resp.status_code == 200
        received_list = received_resp.json()
        assert len(received_list) == 1
        assert received_list[0]["username"] == "grace"
        assert received_list[0]["status"] == "pending"

        # 测试查询收到的所有请求（type=received, status=all）
        received_all_resp = await client.get("/friends/list?type=received&status=all", headers=henry_headers)
        assert received_all_resp.status_code == 200
        received_all_list = received_all_resp.json()
        assert len(received_all_list) == 1

        # 测试好友列表为空（因为还没同意）
        friends_resp = await client.get("/friends/list?type=all&status=accepted", headers=grace_headers)
        assert friends_resp.status_code == 200
        assert friends_resp.json() == []

        # 测试 type=all 且 status=all（应该返回所有相关记录）
        all_relations_resp = await client.get("/friends/list?type=all&status=all", headers=grace_headers)
        assert all_relations_resp.status_code == 200
        all_relations = all_relations_resp.json()
        assert len(all_relations) == 1

    async def test_cannot_add_self_as_friend(self, client: AsyncClient):
        """测试不能添加自己为好友"""
        await client.post("/auth/register", json={
            "username": "selfuser",
            "password": "abc123456",
            "email": "self@example.com"
        })

        login_resp = await client.post("/auth/login", json={
            "username": "selfuser",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 搜索自己（应该被排除）
        search_resp = await client.get("/friends/search?keyword=selfuser", headers=headers)
        assert search_resp.status_code == 200
        assert len(search_resp.json()) == 0  # 不应该搜到自己

        # 直接尝试添加自己
        resp = await client.post("/friends/request/999999", headers=headers)
        # 用户不存在
        assert resp.status_code == 404

    async def test_remove_friend(self, client: AsyncClient):
        """测试删除好友"""
        # 注册两个用户
        await client.post("/auth/register", json={
            "username": "mark",
            "password": "abc123456",
            "email": "mark@example.com"
        })
        await client.post("/auth/register", json={
            "username": "nancy",
            "password": "abc123456",
            "email": "nancy@example.com"
        })

        # mark 登录
        login_resp = await client.post("/auth/login", json={
            "username": "mark",
            "password": "abc123456"
        })
        mark_token = login_resp.json()["access_token"]
        mark_headers = {"Authorization": f"Bearer {mark_token}"}

        # nancy 登录
        login_resp = await client.post("/auth/login", json={
            "username": "nancy",
            "password": "abc123456"
        })
        nancy_token = login_resp.json()["access_token"]
        nancy_headers = {"Authorization": f"Bearer {nancy_token}"}

        # mark 搜索 nancy 并发送好友申请
        search_resp = await client.get("/friends/search?keyword=nancy", headers=mark_headers)
        nancy_id = search_resp.json()[0]["user_id"]
        await client.post(f"/friends/request/{nancy_id}", headers=mark_headers)

        # nancy 同意申请
        pending_resp = await client.get("/friends/list?status=pending&type=received", headers=nancy_headers)
        friendship_id = pending_resp.json()[0]["friendship_id"]
        await client.put(f"/friends/accept/{friendship_id}", headers=nancy_headers)

        # 验证已成为好友
        friends_resp = await client.get("/friends/list?type=all&status=accepted", headers=mark_headers)
        assert len(friends_resp.json()) == 1

        # mark 删除好友
        delete_resp = await client.delete(f"/friends/{friendship_id}", headers=mark_headers)
        assert delete_resp.status_code == 200
        assert delete_resp.json()["message"] == "已删除好友关系"

        # 验证好友关系已删除
        friends_resp = await client.get("/friends/list?type=all&status=accepted", headers=mark_headers)
        assert len(friends_resp.json()) == 0

    async def test_query_with_invalid_params(self, client: AsyncClient):
        """测试无效参数"""
        await client.post("/auth/register", json={
            "username": "testuser",
            "password": "abc123456",
            "email": "test@example.com"
        })

        login_resp = await client.post("/auth/login", json={
            "username": "testuser",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 测试无效 type
        invalid_type_resp = await client.get("/friends/list?type=invalid", headers=headers)
        assert invalid_type_resp.status_code == 400

        # 测试无效 status
        invalid_status_resp = await client.get("/friends/list?status=invalid", headers=headers)
        assert invalid_status_resp.status_code == 400

    async def test_search_users_no_results(self, client: AsyncClient):
        """测试搜索不存在的用户"""
        # 先注册并登录
        await client.post("/auth/register", json={
            "username": "testuser1",
            "password": "abc123456",
            "email": "test1@example.com"
        })
        login_resp = await client.post("/auth/login", json={
            "username": "testuser1",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 搜索不存在的关键词
        resp = await client.get("/friends/search?keyword=nonexistentuser123456", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_send_request_to_nonexistent_user(self, client: AsyncClient):
        """测试向不存在的用户发送好友申请"""
        # 注册并登录
        await client.post("/auth/register", json={
            "username": "testuser2",
            "password": "abc123456",
            "email": "test2@example.com"
        })
        login_resp = await client.post("/auth/login", json={
            "username": "testuser2",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 向不存在的用户ID发送请求
        resp = await client.post("/friends/request/99999", headers=headers)
        assert resp.status_code == 404
        assert "用户不存在" in resp.json()["detail"]

    async def test_accept_nonexistent_request(self, client: AsyncClient):
        """测试同意不存在的好友申请"""
        # 注册并登录
        await client.post("/auth/register", json={
            "username": "testuser3",
            "password": "abc123456",
            "email": "test3@example.com"
        })
        login_resp = await client.post("/auth/login", json={
            "username": "testuser3",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 尝试同意不存在的申请
        resp = await client.put("/friends/accept/99999", headers=headers)
        assert resp.status_code == 404
        assert "好友请求不存在" in resp.json()["detail"]

    async def test_delete_nonexistent_friendship(self, client: AsyncClient):
        """测试删除不存在的好友关系"""
        # 注册并登录
        await client.post("/auth/register", json={
            "username": "testuser4",
            "password": "abc123456",
            "email": "test4@example.com"
        })
        login_resp = await client.post("/auth/login", json={
            "username": "testuser4",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 尝试删除不存在的关系
        resp = await client.delete("/friends/99999", headers=headers)
        assert resp.status_code == 404
        assert "好友关系不存在" in resp.json()["detail"]

    async def test_duplicate_friend_request_accepted(self, client: AsyncClient):
        """测试已经成为好友后再次发送申请"""
        # 注册两个用户
        await client.post("/auth/register", json={
            "username": "user_a",
            "password": "abc123456",
            "email": "a@example.com"
        })
        await client.post("/auth/register", json={
            "username": "user_b",
            "password": "abc123456",
            "email": "b@example.com"
        })
        
        # user_a 登录
        login_resp = await client.post("/auth/login", json={
            "username": "user_a",
            "password": "abc123456"
        })
        a_token = login_resp.json()["access_token"]
        a_headers = {"Authorization": f"Bearer {a_token}"}
        
        # user_b 登录
        login_resp = await client.post("/auth/login", json={
            "username": "user_b",
            "password": "abc123456"
        })
        b_token = login_resp.json()["access_token"]
        b_headers = {"Authorization": f"Bearer {b_token}"}
        
        # 获取 user_b 的 ID
        search_resp = await client.get("/friends/search?keyword=user_b", headers=a_headers)
        b_id = search_resp.json()[0]["user_id"]
        
        # 发送好友申请
        await client.post(f"/friends/request/{b_id}", headers=a_headers)
        
        # user_b 同意申请
        pending_resp = await client.get("/friends/list?status=pending&type=received", headers=b_headers)
        friendship_id = pending_resp.json()[0]["friendship_id"]
        await client.put(f"/friends/accept/{friendship_id}", headers=b_headers)
        
        # user_a 再次尝试发送好友申请（应该失败）
        resp = await client.post(f"/friends/request/{b_id}", headers=a_headers)
        assert resp.status_code == 400
        assert "你们已经是好友了" in resp.json()["detail"]

    async def test_get_friends_empty_list(self, client: AsyncClient):
        """测试新用户获取空的好友列表"""
        # 注册新用户并登录
        await client.post("/auth/register", json={
            "username": "newuser",
            "password": "abc123456",
            "email": "new@example.com"
        })
        login_resp = await client.post("/auth/login", json={
            "username": "newuser",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 新用户应该没有任何好友关系
        resp = await client.get("/friends/list", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []


    async def test_send_request_when_received_pending(self, client: AsyncClient):
        """测试对方已发送申请时，再向对方发送申请的提示"""
        # 注册两个用户
        await client.post("/auth/register", json={
            "username": "sender1",
            "password": "abc123456",
            "email": "sender1@example.com"
        })
        await client.post("/auth/register", json={
            "username": "sender2",
            "password": "abc123456",
            "email": "sender2@example.com"
        })

        # sender1 登录
        login_resp = await client.post("/auth/login", json={
            "username": "sender1",
            "password": "abc123456"
        })
        token1 = login_resp.json()["access_token"]
        headers1 = {"Authorization": f"Bearer {token1}"}

        # sender2 登录
        login_resp = await client.post("/auth/login", json={
            "username": "sender2",
            "password": "abc123456"
        })
        token2 = login_resp.json()["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}

        # sender1 搜索 sender2 并获取 ID
        search_resp = await client.get("/friends/search?keyword=sender2", headers=headers1)
        sender2_id = search_resp.json()[0]["user_id"]

        # sender2 搜索 sender1 并获取 ID
        search_resp = await client.get("/friends/search?keyword=sender1", headers=headers2)
        sender1_id = search_resp.json()[0]["user_id"]

        # sender1 向 sender2 发送好友申请
        resp1 = await client.post(f"/friends/request/{sender2_id}", headers=headers1)
        assert resp1.status_code == 200

        # sender2 反过来向 sender1 发送好友申请（应该失败并提示特定信息）
        resp2 = await client.post(f"/friends/request/{sender1_id}", headers=headers2)
        assert resp2.status_code == 400
        assert "对方已向你发送好友申请，请前往处理" in resp2.json()["detail"]


    async def test_create_friend_group(self, client: AsyncClient):
        """测试创建好友分组"""
        # 注册并登录
        await client.post("/auth/register", json={
            "username": "groupuser",
            "password": "abc123456",
            "email": "group@example.com"
        })
        login_resp = await client.post("/auth/login", json={
            "username": "groupuser",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 创建分组
        resp = await client.post(
            "/friends/groups?group_name=同学",
            headers=headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["group_name"] == "同学"
        assert "id" in data
        
        # 重复创建同名分组应失败
        resp = await client.post(
            "/friends/groups?group_name=同学",
            headers=headers
        )
        assert resp.status_code == 400
        assert "分组名称已存在" in resp.json()["detail"]


    async def test_get_friend_groups(self, client: AsyncClient):
        """测试获取好友分组列表"""
        await client.post("/auth/register", json={
            "username": "grouplist",
            "password": "abc123456",
            "email": "grouplist@example.com"
        })
        login_resp = await client.post("/auth/login", json={
            "username": "grouplist",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 创建多个分组
        await client.post("/friends/groups?group_name=家人", headers=headers)
        await client.post("/friends/groups?group_name=同事", headers=headers)
        
        # 获取分组列表
        resp = await client.get("/friends/groups", headers=headers)
        assert resp.status_code == 200
        groups = resp.json()
        assert len(groups) == 2
        assert groups[0]["group_name"] == "家人"
        assert groups[1]["group_name"] == "同事"


    async def test_update_friend_group(self, client: AsyncClient):
        """测试修改好友分组名称"""
        await client.post("/auth/register", json={
            "username": "groupupdate",
            "password": "abc123456",
            "email": "groupupdate@example.com"
        })
        login_resp = await client.post("/auth/login", json={
            "username": "groupupdate",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 创建分组
        create_resp = await client.post("/friends/groups?group_name=旧名称", headers=headers)
        group_id = create_resp.json()["id"]
        
        # 修改分组名
        resp = await client.put(f"/friends/groups/{group_id}?group_name=新名称", headers=headers)
        assert resp.status_code == 200
        
        # 验证修改成功
        get_resp = await client.get("/friends/groups", headers=headers)
        assert get_resp.json()[0]["group_name"] == "新名称"


    async def test_delete_friend_group(self, client: AsyncClient):
        """测试删除好友分组"""
        await client.post("/auth/register", json={
            "username": "groupdelete",
            "password": "abc123456",
            "email": "groupdelete@example.com"
        })
        login_resp = await client.post("/auth/login", json={
            "username": "groupdelete",
            "password": "abc123456"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 创建分组
        create_resp = await client.post("/friends/groups?group_name=待删除", headers=headers)
        group_id = create_resp.json()["id"]
        
        # 删除分组
        resp = await client.delete(f"/friends/groups/{group_id}", headers=headers)
        assert resp.status_code == 200
        
        # 验证已删除
        get_resp = await client.get("/friends/groups", headers=headers)
        assert get_resp.json() == []


    async def test_add_friend_to_group(self, client: AsyncClient):
        """测试将好友添加到分组"""
        # 注册两个用户
        await client.post("/auth/register", json={
            "username": "user_a",
            "password": "abc123456",
            "email": "a@example.com"
        })
        await client.post("/auth/register", json={
            "username": "user_b",
            "password": "abc123456",
            "email": "b@example.com"
        })
        
        # user_a 登录
        login_resp = await client.post("/auth/login", json={
            "username": "user_a", "password": "abc123456"
        })
        token_a = login_resp.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}
        
        # user_b 登录
        login_resp = await client.post("/auth/login", json={
            "username": "user_b", "password": "abc123456"
        })
        token_b = login_resp.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}
        
        # 获取 user_b 的 ID
        search_resp = await client.get("/friends/search?keyword=user_b", headers=headers_a)
        user_b_id = search_resp.json()[0]["user_id"]
        
        # 发送好友申请并接受
        await client.post(f"/friends/request/{user_b_id}", headers=headers_a)
        
        # user_b 获取申请ID并接受
        list_resp = await client.get("/friends/list?status=pending&type=received", headers=headers_b)
        request_id = list_resp.json()[0]["friendship_id"]
        await client.put(f"/friends/accept/{request_id}", headers=headers_b)
        
        # user_a 创建分组
        create_resp = await client.post("/friends/groups?group_name=好友分组", headers=headers_a)
        group_id = create_resp.json()["id"]
        
        # 将 user_b 添加到分组
        resp = await client.post(
            f"/friends/groups/{group_id}/members/{user_b_id}",
            headers=headers_a
        )
        assert resp.status_code == 200
        
        # 重复添加应失败
        resp = await client.post(
            f"/friends/groups/{group_id}/members/{user_b_id}",
            headers=headers_a
        )
        assert resp.status_code == 400
        assert "好友已在该分组中" in resp.json()["detail"]


    async def test_get_group_members(self, client: AsyncClient):
        """测试获取分组内的好友列表"""
        # 注册两个用户并建立好友关系
        await client.post("/auth/register", json={
            "username": "member1",
            "password": "abc123456",
            "email": "member1@example.com"
        })
        await client.post("/auth/register", json={
            "username": "member2",
            "password": "abc123456",
            "email": "member2@example.com"
        })
        
        login_resp = await client.post("/auth/login", json={
            "username": "member1", "password": "abc123456"
        })
        token1 = login_resp.json()["access_token"]
        headers1 = {"Authorization": f"Bearer {token1}"}
        
        login_resp = await client.post("/auth/login", json={
            "username": "member2", "password": "abc123456"
        })
        token2 = login_resp.json()["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}
        
        # 建立好友关系
        search_resp = await client.get("/friends/search?keyword=member2", headers=headers1)
        member2_id = search_resp.json()[0]["user_id"]
        await client.post(f"/friends/request/{member2_id}", headers=headers1)
        
        list_resp = await client.get("/friends/list?status=pending&type=received", headers=headers2)
        request_id = list_resp.json()[0]["friendship_id"]
        await client.put(f"/friends/accept/{request_id}", headers=headers2)
        
        # 创建分组并添加好友
        create_resp = await client.post("/friends/groups?group_name=测试分组", headers=headers1)
        group_id = create_resp.json()["id"]
        await client.post(f"/friends/groups/{group_id}/members/{member2_id}", headers=headers1)
        
        # 获取分组成员
        resp = await client.get(f"/friends/groups/{group_id}/members", headers=headers1)
        assert resp.status_code == 200
        members = resp.json()
        assert len(members) == 1
        assert members[0]["username"] == "member2"


    async def test_remove_friend_from_group(self, client: AsyncClient):
        """测试将好友移出分组"""
        # 注册并建立好友关系
        await client.post("/auth/register", json={
            "username": "remove1",
            "password": "abc123456",
            "email": "remove1@example.com"
        })
        await client.post("/auth/register", json={
            "username": "remove2",
            "password": "abc123456",
            "email": "remove2@example.com"
        })
        
        login_resp = await client.post("/auth/login", json={
            "username": "remove1", "password": "abc123456"
        })
        token1 = login_resp.json()["access_token"]
        headers1 = {"Authorization": f"Bearer {token1}"}
        
        login_resp = await client.post("/auth/login", json={
            "username": "remove2", "password": "abc123456"
        })
        token2 = login_resp.json()["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}
        
        # 建立好友关系
        search_resp = await client.get("/friends/search?keyword=remove2", headers=headers1)
        remove2_id = search_resp.json()[0]["user_id"]
        await client.post(f"/friends/request/{remove2_id}", headers=headers1)
        
        list_resp = await client.get("/friends/list?status=pending&type=received", headers=headers2)
        request_id = list_resp.json()[0]["friendship_id"]
        await client.put(f"/friends/accept/{request_id}", headers=headers2)
        
        # 创建分组并添加好友
        create_resp = await client.post("/friends/groups?group_name=待移除", headers=headers1)
        group_id = create_resp.json()["id"]
        await client.post(f"/friends/groups/{group_id}/members/{remove2_id}", headers=headers1)
        
        # 移出分组
        resp = await client.delete(f"/friends/groups/{group_id}/members/{remove2_id}", headers=headers1)
        assert resp.status_code == 200
        
        # 验证已移出
        get_resp = await client.get(f"/friends/groups/{group_id}/members", headers=headers1)
        assert get_resp.json() == []