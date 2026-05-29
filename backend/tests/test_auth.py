import pytest
from httpx import AsyncClient
from datetime import timedelta
from app.core.security import create_access_token


@pytest.mark.asyncio
class TestAuth:
    """认证接口测试"""

    async def test_register_success(self, client: AsyncClient):
        """测试成功注册"""
        response = await client.post(
            "/auth/register",
            json={
                "username": "testuser",
                "password": "abc123456",
                "email": "test@example.com",
                "nickname": "测试用户"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == "testuser"
        assert data["nickname"] == "测试用户"
        assert data["email"] == "test@example.com"
        assert "user_id" in data

    async def test_register_duplicate_username(self, client: AsyncClient):
        """测试重复用户名注册失败"""
        # 第一次注册
        await client.post(
            "/auth/register",
            json={
                "username": "duplicate",
                "password": "abc123456",
                "email": "dup1@example.com"
            }
        )
        # 第二次用相同用户名
        response = await client.post(
            "/auth/register",
            json={
                "username": "duplicate",
                "password": "abc123456",
                "email": "dup2@example.com"
            }
        )
        assert response.status_code == 400
        assert "用户名或邮箱已存在" in response.text

    async def test_register_duplicate_email(self, client: AsyncClient):
        """测试重复邮箱注册失败"""
        # 第一次注册
        await client.post(
            "/auth/register",
            json={
                "username": "user1",
                "password": "abc123456",
                "email": "same@example.com"
            }
        )
        # 第二次用相同邮箱
        response = await client.post(
            "/auth/register",
            json={
                "username": "user2",
                "password": "abc123456",
                "email": "same@example.com"
            }
        )
        assert response.status_code == 400
        assert "用户名或邮箱已存在" in response.text

    async def test_register_invalid_username(self, client: AsyncClient):
        """测试非法用户名（包含特殊字符）"""
        response = await client.post(
            "/auth/register",
            json={
                "username": "test@user",
                "password": "abc123456",
                "email": "test@example.com"
            }
        )
        assert response.status_code == 422

    async def test_register_weak_password(self, client: AsyncClient):
        """测试弱密码（纯字母）"""
        response = await client.post(
            "/auth/register",
            json={
                "username": "testuser",
                "password": "abcdefg",
                "email": "test@example.com"
            }
        )
        assert response.status_code == 422
        assert "密码必须包含数字" in response.text

    async def test_login_success(self, client: AsyncClient):
        """测试成功登录"""
        # 先注册
        await client.post(
            "/auth/register",
            json={
                "username": "loginuser",
                "password": "abc123456",
                "email": "login@example.com"
            }
        )

        # 再登录
        response = await client.post(
            "/auth/login",
            json={
                "username": "loginuser",
                "password": "abc123456"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient):
        """测试密码错误"""
        # 先注册
        await client.post(
            "/auth/register",
            json={
                "username": "wrongpwd",
                "password": "abc123456",
                "email": "wrong@example.com"
            }
        )

        # 用错误密码登录
        response = await client.post(
            "/auth/login",
            json={
                "username": "wrongpwd",
                "password": "wrongpassword"
            }
        )
        assert response.status_code == 401
        assert "用户名或密码错误" in response.text

    async def test_login_user_not_exist(self, client: AsyncClient):
        """测试不存在的用户登录"""
        response = await client.post(
            "/auth/login",
            json={
                "username": "nonexistent",
                "password": "abc123456"
            }
        )
        assert response.status_code == 401
        assert "用户名或密码错误" in response.json()["detail"]

    async def test_logout(self, client: AsyncClient):
        """测试登出"""
        # 先注册
        await client.post(
            "/auth/register",
            json={
                "username": "logoutuser",
                "password": "abc123456",
                "email": "logout@example.com"
            }
        )

        # 登录获取 token
        login_resp = await client.post(
            "/auth/login",
            json={
                "username": "logoutuser",
                "password": "abc123456"
            }
        )
        token = login_resp.json()["access_token"]

        # 登出
        response = await client.post(
            "/auth/logout",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        assert response.json()["message"] == "Logged out successfully"

    async def test_delete_account(self, client: AsyncClient):
        """测试注销账号"""
        # 先注册
        await client.post(
            "/auth/register",
            json={
                "username": "deleteuser",
                "password": "abc123456",
                "email": "delete@example.com"
            }
        )

        # 登录获取 token
        login_resp = await client.post(
            "/auth/login",
            json={
                "username": "deleteuser",
                "password": "abc123456"
            }
        )
        token = login_resp.json()["access_token"]

        # 注销账号
        response = await client.delete(
            "/auth/delete_account",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 204

        # 验证用户已被删除（尝试登录应该失败）
        login_resp2 = await client.post(
            "/auth/login",
            json={
                "username": "deleteuser",
                "password": "abc123456"
            }
        )
        assert login_resp2.status_code == 401
        assert login_resp2.json()["detail"] == "用户名或密码错误"

        # 注销后允许重新注册同名账号
        register_resp = await client.post(
            "/auth/register",
            json={
                "username": "deleteuser",
                "password": "abc123456",
                "email": "delete@example.com"
            }
        )
        assert register_resp.status_code == 201
        assert register_resp.json()["username"] == "deleteuser"
        assert register_resp.json()["email"] == "delete@example.com"

    async def test_register_without_phone_success(self, client: AsyncClient):
        """注册时不提供手机号（可选字段）"""
        response = await client.post(
            "/auth/register",
            json={
                "username": "nophone",
                "password": "abc123456",
                "email": "nophone@example.com"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["phone"] is None

    async def test_register_with_valid_phone_success(
        self, client: AsyncClient
    ):
        """注册时提供合法手机号"""
        response = await client.post(
            "/auth/register",
            json={
                "username": "withphone",
                "password": "abc123456",
                "email": "withphone@example.com",
                "phone": "13812345678"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["phone"] == "13812345678"

    async def test_register_with_invalid_phone_format(
        self, client: AsyncClient
    ):
        """注册时手机号格式错误（非11位、不以1开头等）"""
        invalid_phones = [
            "12345678901",      # 不以1开头
            "11234567890",      # 第二位不是3-9
            "1381234567",       # 少于11位
            "138123456789",     # 多于11位
            "13812345abc",      # 包含字母
            "138-1234-5678",    # 包含分隔符
        ]
        for phone in invalid_phones:
            response = await client.post(
                "/auth/register",
                json={
                    "username": f"user_{phone}",
                    "password": "abc123456",
                    "email": f"{phone}@example.com",
                    "phone": phone
                }
            )
            assert response.status_code == 422
            assert "手机号格式不正确" in response.text

    async def test_register_with_phone_empty_string(
        self, client: AsyncClient
    ):
        """注册时手机号传空字符串（应被拒绝）"""
        response = await client.post(
            "/auth/register",
            json={
                "username": "emptyphone",
                "password": "abc123456",
                "email": "empty@example.com",
                "phone": ""
            }
        )
        assert response.status_code == 422
        assert "手机号格式不正确" in response.text

    async def test_register_with_phone_null(self, client: AsyncClient):
        """注册时手机号显式传 null（应等同于不提供）"""
        response = await client.post(
            "/auth/register",
            json={
                "username": "nullphone",
                "password": "abc123456",
                "email": "null@example.com",
                "phone": None
            }
        )
        assert response.status_code == 201
        assert response.json()["phone"] is None

    async def test_register_duplicate_phone(self, client: AsyncClient):
        """注册时手机号重复（已被其他用户使用）"""
        # 第一个用户注册
        await client.post(
            "/auth/register",
            json={
                "username": "userA",
                "password": "abc123456",
                "email": "a@example.com",
                "phone": "13912345678"
            }
        )
        # 第二个用户使用相同手机号
        response = await client.post(
            "/auth/register",
            json={
                "username": "userB",
                "password": "abc123456",
                "email": "b@example.com",
                "phone": "13912345678"
            }
        )
        assert response.status_code == 400
        assert "手机号已存在" in response.text

    async def test_register_duplicate_phone_with_none_other(
        self, client: AsyncClient
    ):
        """注册时手机号重复，但另一个用户手机号为 None（应允许）"""
        # 用户A 手机号为 None
        await client.post(
            "/auth/register",
            json={
                "username": "userA",
                "password": "abc123456",
                "email": "a@example.com"
            }
        )
        # 用户B 使用有效手机号
        response = await client.post(
            "/auth/register",
            json={
                "username": "userB",
                "password": "abc123456",
                "email": "b@example.com",
                "phone": "13912345678"
            }
        )
        assert response.status_code == 201
        assert response.json()["phone"] == "13912345678"

    async def test_get_current_user_info_success(
        self, client: AsyncClient
    ):
        """测试成功获取当前登录用户信息"""
        # 1. 注册用户
        register_resp = await client.post(
            "/auth/register",
            json={
                "username": "meuser",
                "password": "abc123456",
                "email": "me@example.com",
                "nickname": "我的昵称",
                "phone": "13812345678"
            }
        )
        assert register_resp.status_code == 201
        registered_user = register_resp.json()

        # 2. 登录获取 token
        login_resp = await client.post(
            "/auth/login",
            json={
                "username": "meuser",
                "password": "abc123456"
            }
        )
        token = login_resp.json()["access_token"]

        # 3. 请求 /auth/me
        response = await client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )

        # 4. 断言
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == registered_user["user_id"]
        assert data["username"] == "meuser"
        assert data["nickname"] == "我的昵称"
        assert data["email"] == "me@example.com"
        assert data["phone"] == "13812345678"
        assert data["avatar_url"] is None
        assert "created_at" in data

    async def test_get_current_user_info_unauthorized_no_token(
        self, client: AsyncClient
    ):
        """测试未提供 token 时返回 401"""
        response = await client.get("/auth/me")
        assert response.status_code == 401
        assert response.json()["detail"] == "Not authenticated"

    async def test_get_current_user_info_invalid_token(
        self, client: AsyncClient
    ):
        """测试无效 token 返回 401"""
        response = await client.get(
            "/auth/me",
            headers={"Authorization": "Bearer invalid_token_string"}
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "无效的认证令牌"

    async def test_get_current_user_info_expired_token(
        self, client: AsyncClient
    ):
        """测试过期 token 返回 401"""
        # 生成一个已过期的 token（expires_delta 为负数）
        expired_token = create_access_token(
            data={"sub": "1", "username": "expired_user"},
            expires_delta=timedelta(seconds=-1)
        )
        response = await client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"}
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "令牌已过期，请重新登录"

    async def test_get_current_user_info_user_not_found(
        self, client: AsyncClient
    ):
        """测试 token 中的用户已被删除时返回 401"""
        # 1. 注册临时用户
        register_resp = await client.post(
            "/auth/register",
            json={
                "username": "tempuser",
                "password": "abc123456",
                "email": "temp@example.com"
            }
        )
        assert register_resp.status_code == 201

        # 2. 登录获取 token
        login_resp = await client.post(
            "/auth/login",
            json={
                "username": "tempuser",
                "password": "abc123456"
            }
        )
        token = login_resp.json()["access_token"]

        # 3. 注销该用户（删除账号）
        delete_resp = await client.delete(
            "/auth/delete_account",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert delete_resp.status_code == 204

        # 4. 使用已删除用户的 token 访问 /auth/me
        response = await client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "用户不存在"
