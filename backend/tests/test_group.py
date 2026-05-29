import pytest
from httpx import AsyncClient
from app.api.websocket import handle_chat_message
from app.db.database import db


@pytest.mark.asyncio
class TestGroupSystem:
    """群聊功能测试"""

    async def _register_and_login(
        self,
        client: AsyncClient,
        username: str,
        password: str = "test123456",
        email: str = None
    ) -> dict:
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

        headers = {"Authorization": f"Bearer {token}"}
        me_resp = await client.get("/auth/me", headers=headers)
        user_id = me_resp.json()["user_id"]

        return {"token": token, "user_id": user_id, "username": username}

    async def _search_user_id(
        self,
        client: AsyncClient,
        token: str,
        keyword: str
    ) -> int:
        headers = {"Authorization": f"Bearer {token}"}
        resp = await client.get(f"/friends/search?keyword={keyword}", headers=headers)
        return resp.json()[0]["user_id"]

    async def _make_friends(
        self,
        client: AsyncClient,
        token_a: str,
        token_b: str,
        user_b_id: int
    ):
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        await client.post(f"/friends/request/{user_b_id}", headers=headers_a)

        resp = await client.get(
            "/friends/list?status=pending&type=received",
            headers=headers_b
        )
        friendship_id = resp.json()[0]["friendship_id"]
        await client.put(f"/friends/accept/{friendship_id}", headers=headers_b)

    async def _create_group(
        self,
        client: AsyncClient,
        owner_token: str,
        member_ids: list[int],
        group_name: str = "测试群"
    ) -> int:
        headers = {"Authorization": f"Bearer {owner_token}"}
        resp = await client.post(
            "/conversations/create",
            headers=headers,
            json={
                "type": "group",
                "member_ids": member_ids,
                "group_name": group_name
            }
        )
        assert resp.status_code == 200
        return resp.json()["conversation_id"]

    async def test_create_group_from_selected_friends(
        self,
        client: AsyncClient
    ):
        owner = await self._register_and_login(client, "owner_select")
        friend_a = await self._register_and_login(client, "friend_a_select")
        friend_b = await self._register_and_login(client, "friend_b_select")

        friend_a_id = await self._search_user_id(
            client,
            owner["token"],
            friend_a["username"]
        )
        friend_b_id = await self._search_user_id(
            client,
            owner["token"],
            friend_b["username"]
        )

        await self._make_friends(
            client,
            owner["token"],
            friend_a["token"],
            friend_a_id
        )
        await self._make_friends(
            client,
            owner["token"],
            friend_b["token"],
            friend_b_id
        )

        conversation_id = await self._create_group(
            client,
            owner["token"],
            [friend_a_id],
            "部分好友群"
        )

        headers_owner = {"Authorization": f"Bearer {owner['token']}"}
        info_resp = await client.get(
            f"/conversations/{conversation_id}/group-info",
            headers=headers_owner
        )
        assert info_resp.status_code == 200
        data = info_resp.json()
        member_ids = {member["user_id"] for member in data["members"]}

        assert data["conversation_name"] == "部分好友群"
        assert owner["user_id"] in member_ids
        assert friend_a_id in member_ids
        assert friend_b_id not in member_ids

    async def test_group_info_contains_name_members_and_announcements(
        self,
        client: AsyncClient
    ):
        owner = await self._register_and_login(client, "owner_info")
        member = await self._register_and_login(client, "member_info")

        member_id = await self._search_user_id(
            client,
            owner["token"],
            member["username"]
        )
        await self._make_friends(client, owner["token"], member["token"], member_id)

        conversation_id = await self._create_group(
            client,
            owner["token"],
            [member_id],
            "信息展示群"
        )

        headers_owner = {"Authorization": f"Bearer {owner['token']}"}
        await client.post(
            f"/conversations/{conversation_id}/announcements",
            headers=headers_owner,
            json={"content": "第一条公告"}
        )
        await client.post(
            f"/conversations/{conversation_id}/announcements",
            headers=headers_owner,
            json={"content": "第二条公告"}
        )

        headers_member = {"Authorization": f"Bearer {member['token']}"}
        info_resp = await client.get(
            f"/conversations/{conversation_id}/group-info",
            headers=headers_member
        )
        assert info_resp.status_code == 200
        data = info_resp.json()

        roles = {row["user_id"]: row["role"] for row in data["members"]}
        assert data["conversation_name"] == "信息展示群"
        assert owner["user_id"] in roles
        assert member_id in roles
        assert roles[owner["user_id"]] == "owner"
        assert len(data["announcements"]) == 2
        assert data["announcements"][0]["content"] == "第二条公告"
        assert data["announcements"][1]["content"] == "第一条公告"

    async def test_owner_can_assign_admin_and_transfer_owner(
        self,
        client: AsyncClient
    ):
        owner = await self._register_and_login(client, "owner_role")
        admin_user = await self._register_and_login(client, "admin_role")
        new_owner = await self._register_and_login(client, "new_owner_role")

        admin_id = await self._search_user_id(client, owner["token"], admin_user["username"])
        new_owner_id = await self._search_user_id(client, owner["token"], new_owner["username"])

        await self._make_friends(client, owner["token"], admin_user["token"], admin_id)
        await self._make_friends(client, owner["token"], new_owner["token"], new_owner_id)

        conversation_id = await self._create_group(
            client,
            owner["token"],
            [admin_id, new_owner_id],
            "角色管理群"
        )
        headers_owner = {"Authorization": f"Bearer {owner['token']}"}

        set_admin_resp = await client.patch(
            f"/conversations/{conversation_id}/members/{admin_id}/role",
            headers=headers_owner,
            json={"role": "admin"}
        )
        assert set_admin_resp.status_code == 200

        transfer_resp = await client.patch(
            f"/conversations/{conversation_id}/members/{new_owner_id}/role",
            headers=headers_owner,
            json={"role": "owner"}
        )
        assert transfer_resp.status_code == 200
        assert "群主已转让" in transfer_resp.json()["message"]

        info_resp = await client.get(
            f"/conversations/{conversation_id}/group-info",
            headers=headers_owner
        )
        roles = {
            row["user_id"]: row["role"]
            for row in info_resp.json()["members"]
        }
        assert roles[admin_id] == "admin"
        assert roles[new_owner_id] == "owner"
        assert roles[owner["user_id"]] == "member"

    async def test_announcement_permission_owner_and_admin_only(
        self,
        client: AsyncClient
    ):
        owner = await self._register_and_login(client, "owner_announce")
        admin_user = await self._register_and_login(client, "admin_announce")
        member = await self._register_and_login(client, "member_announce")

        admin_id = await self._search_user_id(client, owner["token"], admin_user["username"])
        member_id = await self._search_user_id(client, owner["token"], member["username"])

        await self._make_friends(client, owner["token"], admin_user["token"], admin_id)
        await self._make_friends(client, owner["token"], member["token"], member_id)

        conversation_id = await self._create_group(
            client,
            owner["token"],
            [admin_id, member_id],
            "公告权限群"
        )

        headers_owner = {"Authorization": f"Bearer {owner['token']}"}
        set_admin_resp = await client.patch(
            f"/conversations/{conversation_id}/members/{admin_id}/role",
            headers=headers_owner,
            json={"role": "admin"}
        )
        assert set_admin_resp.status_code == 200

        headers_member = {"Authorization": f"Bearer {member['token']}"}
        member_resp = await client.post(
            f"/conversations/{conversation_id}/announcements",
            headers=headers_member,
            json={"content": "普通成员公告"}
        )
        assert member_resp.status_code == 403

        headers_admin = {"Authorization": f"Bearer {admin_user['token']}"}
        admin_resp = await client.post(
            f"/conversations/{conversation_id}/announcements",
            headers=headers_admin,
            json={"content": "管理员公告"}
        )
        assert admin_resp.status_code == 200

        owner_resp = await client.post(
            f"/conversations/{conversation_id}/announcements",
            headers=headers_owner,
            json={"content": "群主公告"}
        )
        assert owner_resp.status_code == 200

        list_resp = await client.get(
            f"/conversations/{conversation_id}/announcements",
            headers=headers_owner
        )
        contents = [row["content"] for row in list_resp.json()]
        assert "管理员公告" in contents
        assert "群主公告" in contents

    async def test_remove_member_permission_rules(
        self,
        client: AsyncClient
    ):
        owner = await self._register_and_login(client, "owner_remove")
        admin_user = await self._register_and_login(client, "admin_remove")
        member_a = await self._register_and_login(client, "member_a_remove")
        member_b = await self._register_and_login(client, "member_b_remove")

        admin_id = await self._search_user_id(client, owner["token"], admin_user["username"])
        member_a_id = await self._search_user_id(client, owner["token"], member_a["username"])
        member_b_id = await self._search_user_id(client, owner["token"], member_b["username"])

        await self._make_friends(client, owner["token"], admin_user["token"], admin_id)
        await self._make_friends(client, owner["token"], member_a["token"], member_a_id)
        await self._make_friends(client, owner["token"], member_b["token"], member_b_id)

        conversation_id = await self._create_group(
            client,
            owner["token"],
            [admin_id, member_a_id, member_b_id],
            "移除权限群"
        )

        headers_owner = {"Authorization": f"Bearer {owner['token']}"}
        set_admin_resp = await client.patch(
            f"/conversations/{conversation_id}/members/{admin_id}/role",
            headers=headers_owner,
            json={"role": "admin"}
        )
        assert set_admin_resp.status_code == 200

        headers_admin = {"Authorization": f"Bearer {admin_user['token']}"}
        remove_member_resp = await client.delete(
            f"/conversations/{conversation_id}/members/{member_a_id}",
            headers=headers_admin
        )
        assert remove_member_resp.status_code == 200

        headers_member_a = {"Authorization": f"Bearer {member_a['token']}"}
        info_after_removed = await client.get(
            f"/conversations/{conversation_id}/group-info",
            headers=headers_member_a
        )
        assert info_after_removed.status_code == 200
        assert info_after_removed.json()["conversation_name"] == "移除权限群"
        member_ids_after_removed = {
            row["user_id"] for row in info_after_removed.json()["members"]
        }
        assert member_a_id not in member_ids_after_removed

        messages_after_removed = await client.get(
            f"/conversations/{conversation_id}/messages",
            headers=headers_member_a
        )
        assert messages_after_removed.status_code == 200
        assert len(messages_after_removed.json()) >= 1
        async with db.create_session() as session:
            send_result = await handle_chat_message(
                {"conversation_id": conversation_id, "content": "移除后的新消息"},
                sender_id=owner["user_id"],
                db=session
            )
        assert send_result["type"] == "message_sent"

        messages_after_new_send = await client.get(
            f"/conversations/{conversation_id}/messages",
            headers=headers_member_a
        )
        assert messages_after_new_send.status_code == 200
        contents = [row["content"] for row in messages_after_new_send.json()]
        assert "移除后的新消息" not in contents
        removed_announce_resp = await client.post(
            f"/conversations/{conversation_id}/announcements",
            headers=headers_member_a,
            json={"content": "被移出成员发公告"}
        )
        assert removed_announce_resp.status_code == 403

        remove_owner_resp = await client.delete(
            f"/conversations/{conversation_id}/members/{owner['user_id']}",
            headers=headers_admin
        )
        assert remove_owner_resp.status_code == 403

        remove_admin_resp = await client.delete(
            f"/conversations/{conversation_id}/members/{admin_id}",
            headers=headers_admin
        )
        assert remove_admin_resp.status_code == 403

        owner_remove_admin_resp = await client.delete(
            f"/conversations/{conversation_id}/members/{admin_id}",
            headers=headers_owner
        )
        assert owner_remove_admin_resp.status_code == 200

        owner_remove_self_resp = await client.delete(
            f"/conversations/{conversation_id}/members/{owner['user_id']}",
            headers=headers_owner
        )
        assert owner_remove_self_resp.status_code == 400

    async def test_member_invite_requires_owner_or_admin_review(
        self,
        client: AsyncClient
    ):
        owner = await self._register_and_login(client, "owner_invite")
        admin_user = await self._register_and_login(client, "admin_invite")
        inviter = await self._register_and_login(client, "inviter_invite")
        invitee = await self._register_and_login(client, "invitee_invite")

        admin_id = await self._search_user_id(client, owner["token"], admin_user["username"])
        inviter_id = await self._search_user_id(client, owner["token"], inviter["username"])

        await self._make_friends(client, owner["token"], admin_user["token"], admin_id)
        await self._make_friends(client, owner["token"], inviter["token"], inviter_id)

        invitee_id = await self._search_user_id(client, inviter["token"], invitee["username"])
        await self._make_friends(client, inviter["token"], invitee["token"], invitee_id)

        conversation_id = await self._create_group(
            client,
            owner["token"],
            [admin_id, inviter_id],
            "邀请审核群"
        )

        headers_owner = {"Authorization": f"Bearer {owner['token']}"}
        await client.patch(
            f"/conversations/{conversation_id}/members/{admin_id}/role",
            headers=headers_owner,
            json={"role": "admin"}
        )

        headers_inviter = {"Authorization": f"Bearer {inviter['token']}"}
        create_invite_resp = await client.post(
            f"/conversations/{conversation_id}/invites",
            headers=headers_inviter,
            json={"invitee_ids": [invitee_id]}
        )
        assert create_invite_resp.status_code == 200
        invitation_id = create_invite_resp.json()["invitation_ids"][0]

        member_list_resp = await client.get(
            f"/conversations/{conversation_id}/invites",
            headers=headers_inviter
        )
        assert member_list_resp.status_code == 403

        headers_admin = {"Authorization": f"Bearer {admin_user['token']}"}
        admin_list_resp = await client.get(
            f"/conversations/{conversation_id}/invites",
            headers=headers_admin
        )
        assert admin_list_resp.status_code == 200
        invite_info = admin_list_resp.json()[0]
        assert invite_info["inviter_id"] == inviter_id
        assert invite_info["inviter_username"] == inviter["username"]
        assert "inviter_avatar_url" in invite_info
        assert invite_info["invitee_id"] == invitee_id
        assert invite_info["invitee_username"] == invitee["username"]
        assert "invitee_avatar_url" in invite_info

        review_resp = await client.put(
            f"/conversations/{conversation_id}/invites/{invitation_id}/review",
            headers=headers_admin,
            json={"action": "approved"}
        )
        assert review_resp.status_code == 200

        info_resp = await client.get(
            f"/conversations/{conversation_id}/group-info",
            headers=headers_owner
        )
        member_ids = {m["user_id"] for m in info_resp.json()["members"]}
        assert invitee_id in member_ids

    async def test_group_member_can_leave_freely(
        self,
        client: AsyncClient
    ):
        owner = await self._register_and_login(client, "owner_leave")
        member = await self._register_and_login(client, "member_leave")

        member_id = await self._search_user_id(
            client,
            owner["token"],
            member["username"]
        )
        await self._make_friends(client, owner["token"], member["token"], member_id)

        conversation_id = await self._create_group(
            client,
            owner["token"],
            [member_id],
            "退出群聊群"
        )

        headers_member = {"Authorization": f"Bearer {member['token']}"}
        leave_resp = await client.delete(
            f"/conversations/{conversation_id}/leave",
            headers=headers_member
        )
        assert leave_resp.status_code == 200

        info_resp = await client.get(
            f"/conversations/{conversation_id}/group-info",
            headers=headers_member
        )
        assert info_resp.status_code == 200
        member_ids = {row["user_id"] for row in info_resp.json()["members"]}
        assert member_id not in member_ids

    async def test_delete_owner_auto_transfers_and_exits_group(
        self,
        client: AsyncClient
    ):
        owner = await self._register_and_login(client, "owner_deleted")
        second = await self._register_and_login(client, "second_joined")
        third = await self._register_and_login(client, "third_joined")

        second_id = await self._search_user_id(
            client,
            owner["token"],
            second["username"]
        )
        third_id = await self._search_user_id(
            client,
            owner["token"],
            third["username"]
        )

        await self._make_friends(client, owner["token"], second["token"], second_id)
        await self._make_friends(client, owner["token"], third["token"], third_id)

        conversation_id = await self._create_group(
            client,
            owner["token"],
            [second_id, third_id],
            "注销自动退群"
        )

        owner_headers = {"Authorization": f"Bearer {owner['token']}"}
        delete_resp = await client.delete(
            "/auth/delete_account",
            headers=owner_headers
        )
        assert delete_resp.status_code == 204

        second_headers = {"Authorization": f"Bearer {second['token']}"}
        info_resp = await client.get(
            f"/conversations/{conversation_id}/group-info",
            headers=second_headers
        )
        assert info_resp.status_code == 200
        members = info_resp.json()["members"]
        member_ids = {row["user_id"] for row in members}
        roles = {row["user_id"]: row["role"] for row in members}
        assert owner["user_id"] not in member_ids
        assert roles[second_id] == "owner"
        assert roles[third_id] == "member"

        messages_resp = await client.get(
            f"/conversations/{conversation_id}/messages",
            headers=second_headers
        )
        assert messages_resp.status_code == 200
        owner_messages = [
            row for row in messages_resp.json()
            if row["sender_id"] == owner["user_id"]
        ]
        assert owner_messages
        assert all(row["sender_name"] == "已注销用户" for row in owner_messages)
        assert all(row["sender_avatar"] is None for row in owner_messages)
