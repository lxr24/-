import pytest
import io
from httpx import AsyncClient
from app.core import config as app_config


@pytest.mark.asyncio
class TestAuth:
    """认证接口测试"""


    async def _register_and_login(self, client, username, email, password="abc123456", phone=None):
        """辅助方法：注册并登录，返回 token"""
        await client.post(
            "/auth/register",
            json={
                "username": username,
                "password": password,
                "email": email,
                "phone": phone
            }
        )
        login_resp = await client.post(
            "/auth/login",
            json={"username": username, "password": password}
        )
        return login_resp.json()["access_token"]

    # ----- 修改非敏感字段（无需密码）-----
    async def test_update_nickname_without_password(self, client: AsyncClient):
        """修改昵称（非敏感）不需要密码"""
        token = await self._register_and_login(client, "nicktest", "nick@example.com")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"nickname": "新昵称"}
        )
        assert response.status_code == 200
        assert response.json()["nickname"] == "新昵称"

    async def test_update_avatar_without_password(self, client: AsyncClient):
        """修改头像URL（非敏感）不需要密码"""
        token = await self._register_and_login(client, "avartest", "avatar@example.com")
        new_url = "https://example.com/avatar.png"
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"avatar_url": new_url}
        )
        assert response.status_code == 200
        assert response.json()["avatar_url"] == new_url

    # ----- 修改敏感字段（需要 current_password）-----
    async def test_update_username_without_password_fails(self, client: AsyncClient):
        """修改用户名不提供密码应失败"""
        token = await self._register_and_login(client, "usernopwd", "usernopwd@example.com")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"username": "newusername"}
        )
        assert response.status_code == 400
        assert "修改敏感信息需要提供当前密码" in response.text

    async def test_update_username_with_wrong_password_fails(self, client: AsyncClient):
        """修改用户名提供错误密码应失败"""
        token = await self._register_and_login(client, "userwrongpwd", "wrongpwd@example.com")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"username": "newusername", "current_password": "wrongpass"}
        )
        assert response.status_code == 401
        assert "当前密码错误" in response.text

    async def test_update_username_success(self, client: AsyncClient):
        """成功修改用户名（提供正确密码）"""
        token = await self._register_and_login(client, "oldname", "old@example.com", password="abc123456")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"username": "newname", "current_password": "abc123456"}
        )
        assert response.status_code == 200
        assert response.json()["username"] == "newname"
        # 验证登录只能使用新用户名
        login_resp = await client.post("/auth/login", json={"username": "newname", "password": "abc123456"})
        assert login_resp.status_code == 200

    async def test_update_username_duplicate(self, client: AsyncClient):
        """修改用户名冲突（已存在）"""
        # 创建两个用户，登录第一个
        await client.post("/auth/register", json={"username": "target", "password": "abc123456", "email": "target@example.com"})
        token = await self._register_and_login(client, "changer", "changer@example.com", password="abc123456")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"username": "target", "current_password": "abc123456"}
        )
        assert response.status_code == 400
        assert "用户名已存在" in response.text

    async def test_update_email_success(self, client: AsyncClient):
        """成功修改邮箱"""
        token = await self._register_and_login(client, "emailuser", "old@example.com", password="abc123456")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"email": "new@example.com", "current_password": "abc123456"}
        )
        assert response.status_code == 200
        assert response.json()["email"] == "new@example.com"

    async def test_update_email_duplicate(self, client: AsyncClient):
        """修改邮箱冲突"""
        await client.post("/auth/register", json={"username": "exist", "password": "abc123456", "email": "exist@example.com"})
        token = await self._register_and_login(client, "changer", "changer@example.com", password="abc123456")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"email": "exist@example.com", "current_password": "abc123456"}
        )
        assert response.status_code == 400
        assert "邮箱已存在" in response.text

    async def test_update_phone_success(self, client: AsyncClient):
        """成功修改手机号（提供正确密码）"""
        token = await self._register_and_login(client, "phoneuser", "phone@example.com", password="abc123456")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"phone": "15912345678", "current_password": "abc123456"}
        )
        assert response.status_code == 200
        assert response.json()["phone"] == "15912345678"

    async def test_update_phone_duplicate(self, client: AsyncClient):
        """修改手机号冲突（已被其他用户使用）"""
        # 用户A 已有手机号
        await client.post("/auth/register", json={
            "username": "userA", "password": "abc123456", "email": "a@example.com", "phone": "18812345678"
        })
        # 用户B 登录
        token = await self._register_and_login(client, "userB", "b@example.com", password="abc123456")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"phone": "18812345678", "current_password": "abc123456"}
        )
        assert response.status_code == 400
        assert "手机号已存在" in response.text

    async def test_update_phone_invalid_format(self, client: AsyncClient):
        """修改手机号格式错误"""
        token = await self._register_and_login(client, "badphone", "bad@example.com", password="abc123456")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"phone": "12345", "current_password": "abc123456"}
        )
        assert response.status_code == 422
        assert "手机号格式不正确" in response.text

    async def test_update_phone_empty_string_rejected(self, client: AsyncClient):
        """修改手机号传空字符串被拒绝"""
        token = await self._register_and_login(client, "emptyphone", "empty@example.com", password="abc123456")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"phone": "", "current_password": "abc123456"}
        )
        assert response.status_code == 422
        assert "手机号格式不正确" in response.text

    async def test_update_phone_to_none(self, client: AsyncClient):
        """修改手机号为 None 表示不修改（原有手机号保持不变）"""
        # 注册时带有手机号
        await client.post("/auth/register", json={
            "username": "hasphone", "password": "abc123456", "email": "has@example.com", "phone": "15011112222"
        })
        login = await client.post("/auth/login", json={"username": "hasphone", "password": "abc123456"})
        token = login.json()["access_token"]
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"phone": None, "current_password": "abc123456"}  # None 表示不修改
        )
        assert response.status_code == 200
        assert response.json()["phone"] == "15011112222"  # 未改变

    async def test_update_password_success(self, client: AsyncClient):
        """成功修改密码"""
        token = await self._register_and_login(client, "passuser", "pass@example.com", password="old123456")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"password": "newPass789", "current_password": "old123456"}
        )
        assert response.status_code == 200
        # 使用新密码登录
        login_resp = await client.post("/auth/login", json={"username": "passuser", "password": "newPass789"})
        assert login_resp.status_code == 200
        # 旧密码登录失败
        login_resp2 = await client.post("/auth/login", json={"username": "passuser", "password": "old123456"})
        assert login_resp2.status_code == 401

    async def test_update_password_weak(self, client: AsyncClient):
        """修改密码为弱密码（纯字母）"""
        token = await self._register_and_login(client, "weakpass", "weak@example.com", password="abc123456")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"password": "abcdefg", "current_password": "abc123456"}
        )
        assert response.status_code == 422
        assert "密码必须包含数字" in response.text

    async def test_update_multiple_fields_success(self, client: AsyncClient):
        """同时修改多个字段（包括敏感和非敏感）"""
        token = await self._register_and_login(client, "multi", "multi@example.com", password="abc123456", phone="13800001111")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "username": "multinew",
                "nickname": "新昵称",
                "email": "newmulti@example.com",
                "phone": "15911112222",
                "avatar_url": "https://example.com/new.png",
                "current_password": "abc123456"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "multinew"
        assert data["nickname"] == "新昵称"
        assert data["email"] == "newmulti@example.com"
        assert data["phone"] == "15911112222"
        assert data["avatar_url"] == "https://example.com/new.png"

    async def test_update_no_fields(self, client: AsyncClient):
        """不提供任何字段，返回当前用户信息（无修改）"""
        token = await self._register_and_login(client, "nofields", "nofields@example.com")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "nofields"

    async def test_update_phone_without_current_password_fails(self, client: AsyncClient):
        """修改手机号不提供密码应失败"""
        token = await self._register_and_login(client, "phoneverify", "phonev@example.com", password="abc123456")
        response = await client.put(
            "/auth/profile",
            headers={"Authorization": f"Bearer {token}"},
            json={"phone": "15912345678"}  # 缺少 current_password
        )
        assert response.status_code == 400
        assert "修改敏感信息需要提供当前密码" in response.text

    # ----- 头像文件上传 -----
    async def test_upload_avatar_success(self, client: AsyncClient):
        """成功上传 PNG 头像"""
        token = await self._register_and_login(client, "avatarfile", "avatarfile@example.com")
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00"
            b"\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18"
            b"\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        response = await client.post(
            "/auth/avatar",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("avatar.png", io.BytesIO(png_bytes), "image/png")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["avatar_url"] is not None
        assert data["avatar_url"].startswith("/uploads/avatars/")
        assert data["avatar_url"].endswith(".png")

    async def test_upload_avatar_invalid_type(self, client: AsyncClient):
        """上传非图片文件应失败"""
        token = await self._register_and_login(client, "avatarbad", "avatarbad@example.com")
        response = await client.post(
            "/auth/avatar",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("virus.exe", io.BytesIO(b"MZ\x00\x00"), "application/octet-stream")},
        )
        assert response.status_code == 400
        assert "不支持的文件类型" in response.text

    async def test_upload_avatar_too_large(self, client: AsyncClient, monkeypatch):
        """上传超过大小限制的文件应失败"""
        monkeypatch.setattr(app_config.settings, "max_avatar_size", 10)  # 设置为 10 字节
        token = await self._register_and_login(client, "avatarbig", "avatarbig@example.com")
        png_bytes = b"\x89PNG" + b"\x00" * 100
        response = await client.post(
            "/auth/avatar",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("big.png", io.BytesIO(png_bytes), "image/png")},
        )
        assert response.status_code == 400
        assert "文件过大" in response.text

    async def test_upload_avatar_unauthenticated(self, client: AsyncClient):
        """未认证用户上传头像应返回 401"""
        response = await client.post(
            "/auth/avatar",
            files={"file": ("a.png", io.BytesIO(b"\x89PNG"), "image/png")},
        )
        assert response.status_code == 401
