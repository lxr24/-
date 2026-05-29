import React, { useEffect, useState } from "react";
import { request } from "../../utils/network";
import { BACKEND_URL } from "../../constants/string";
import { FriendItem } from "../../utils/types";
import FriendList from "./FriendList";

interface Group {
    id?: number;
    group_name: string;
    created_at?: string;
    // 可以接受父组件传入的成员
    members?: FriendItem[];
}

interface Props {
    onAddGroup: (friendId?: number | string, friend?: FriendItem) => void;
    refreshSignal?: number;
    onChatSelected?: (chatId: string) => void;
}

const GroupedFriendList: React.FC<Props> = ({ onAddGroup, refreshSignal, onChatSelected }) => {
    const [groups, setGroups] = useState<Group[]>([]);
    const [allFriends, setAllFriends] = useState<FriendItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const fetchData = async () => {
        setLoading(true);
        setError(undefined);
        try {
            // 获取所有分组
            const groupsRes: any = await request(`${BACKEND_URL}/api/friends/groups`, "GET", true).catch(() => []);
            // 获取全部好友列表（用于构造未分组好友）
            const friendsRes: any = await request(`${BACKEND_URL}/api/friends/list`, "GET", true).catch(() => []);

            const normalizedFriends: FriendItem[] = Array.isArray(friendsRes)
                ? friendsRes.map((f: any) => ({ ...(f || {}), id: (f && (f.id ?? f.user_id)) }))
                : [];

                // 以 user_id / id 建索引，便于给分组成员补齐 friendship_id
                const friendMap = new Map<string, FriendItem>();
                normalizedFriends.forEach((f: any) => {
                    const key = String(f?.user_id);
                    if (key !== "undefined" && key !== "null") {
                        friendMap.set(key, f);
                    }
                });

            let normalizedGroups: Group[] = [];
            if (Array.isArray(groupsRes)) {
                // 为每个分组调用 members 接口获取分组成员
                const membersPromises = groupsRes.map((g: any) =>
                request(`${BACKEND_URL}/api/friends/groups/${g.id}/members?group_id=${g.id}`, "GET", true)
                    .then((res: any) => Array.isArray(res) ? res : [])
                    .catch((e: any) => {
                    // 后端在错误时可能返回 { detail: [...] }，我们容错处理为 []
                    console.warn(`failed to fetch members for group ${g.id}`, e);
                    return [];
                    })
                );

                const membersResults = await Promise.all(membersPromises);

                normalizedGroups = groupsRes.map((g: any, idx: number) => ({
                ...(g || {}),
                members: Array.isArray(membersResults[idx])
                                ? membersResults[idx].map((m: any) => {
                                        const normalized = { ...(m || {}), id: (m && m.user_id) };
                                        const matched = friendMap.get(String(normalized.user_id));
                                        // 把 friendship_id 合并进来，保证 grouped 里删除好友可用
                                        return matched ? { ...normalized, friendship_id: (matched as any).friendship_id } : normalized;
                                    })
                    : [],
                }));
            }

            setAllFriends(normalizedFriends);
            setGroups(normalizedGroups);
        } catch (err) {
            console.error("GroupedFriendList fetch error", err);
            setError("获取分组好友失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [refreshSignal]);

	useEffect(() => {
		const handleRefresh = () => fetchData();
		window.addEventListener("local_refresh_grouped_friends", handleRefresh);
		return () => window.removeEventListener("local_refresh_grouped_friends", handleRefresh);
	}, [fetchData]);
    // 从分组移除好友
    const removeFromGroup = async (groupId: number | string | undefined, friend: FriendItem) => {
        if (typeof groupId === "undefined") return;
        const friendId = (friend as any).user_id;
        if (typeof friendId === "undefined") return;

        try {
            const groupIdStr = encodeURIComponent(String(groupId));
            const friendIdStr = encodeURIComponent(String(friendId));
            await request(
                `${BACKEND_URL}/api/friends/groups/${groupIdStr}/members/${friendIdStr}?group_id=${groupIdStr}&friend_id=${friendIdStr}`,
                "DELETE",
                true
            );

            // 仅更新当前组：把该好友从当前组成员中移除
            setGroups((prev) =>
                prev.map((g) => {
                if (String(g.id) !== String(groupId)) return g;
                const nextMembers = Array.isArray(g.members)
                    ? g.members.filter((m: any) => String((m && (m.id ?? m.user_id))) !== String(friendId))
                    : [];
                return { ...g, members: nextMembers };
                })
            );
        } catch (err: any) {
            console.error("removeFromGroup error", err);
            alert(err?.message || "移出分组失败");
        }
    };

    // 删除分组，仅删除当前分组并本地更新
    const deleteGroup = async (groupId: number | string | undefined) => {
        if (typeof groupId === "undefined") return;
        try {
            await request(`${BACKEND_URL}/api/friends/groups/${groupId}`, "DELETE", true);
            setGroups((prev) => prev.filter((g) => String(g.id) !== String(groupId)));
        } catch (err: any) {
            console.error("deleteGroup error", err);
            alert(err?.message || "删除分组失败");
        }
    };

    // 删除好友：统一更新所有分组，避免某个分组局部状态与全局不一致
    const deleteFriend = async (friend: FriendItem) => {
        const friendId = (friend as any).user_id;
        const friendshipId = (friend as any).friendship_id
            ?? allFriends.find((f: any) => String(f?.user_id) === String(friendId))?.friendship_id;

        try {
            await request(`${BACKEND_URL}/api/friends/${friendshipId}?friendship_id=${friendshipId}`, "DELETE", true);

            // 从全部好友移除
            setAllFriends((prev) => prev.filter((f: any) => String(f?.user_id) !== String(friendId)));
            // 从所有分组成员中移除
            setGroups((prev) =>
                prev.map((g) => ({
                    ...g,
                    members: Array.isArray(g.members)
                        ? g.members.filter((m: any) => String(m?.user_id) !== String(friendId))
                        : [],
                }))
            );
        } catch (err: any) {
            console.error("deleteFriend error", err);
            setError(err?.message || "删除好友失败");
        }
    };

    const buildGroupsWithMembers = () => {
        const groupsWithMembers: { key: string; name: string; members: FriendItem[]; groupId?: number | string; isUngrouped?: boolean }[] = [];

        const assigned = new Set<string | number>();

        for (const g of groups) {
            const members: FriendItem[] = Array.isArray(g.members)
            ? g.members.map((m: any) => ({ ...(m || {}), id: (m && (m.id ?? m.user_id)) }))
            : [];

        members.forEach((m) => assigned.add(m.id ?? (m as any).user_id));
        groupsWithMembers.push({ key: String(g.id ?? g.group_name), name: g.group_name, members, groupId: g.id });
        }

        // 未分组好友
        const ungrouped = allFriends.filter((f) => !assigned.has(f.id ?? (f as any).user_id));
        groupsWithMembers.push({ key: "__ungrouped", name: "未分组好友", members: ungrouped, isUngrouped: true });

        return groupsWithMembers;
    };

    if (loading) return <div style={{ color: "#999", height: 200 }}></div>;
    if (error) return <div style={{ color: "#c4341a" }}>{error}</div>;

    const groupsData = buildGroupsWithMembers();

    return (
        <div>
        <div style={{ height: 700, overflowY: "auto", paddingRight: 6 }}>
        {groupsData.map((g) => (
            <div key={g.key} style={{ marginBottom: 8 }}>
            <div
                onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: 6,
                background: "#fafafa",
                border: "1px solid #eee",
                cursor: "pointer",
                }}
            >
                {/* 左侧：组名 + 数量 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div style={{ color: "#888" }}>{g.members.length}</div>
                </div>

                {/* 右侧：删除分组按钮（未分组好友不显示） */}
                {!g.isUngrouped ? (
                <button
                    type="button"
                    onClick={(e) => {
                    e.stopPropagation();
                    deleteGroup(g.groupId);
                    }}
                    style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "none",
                    background: "#fa6b6bff",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 12,
                    }}
                >
                    删除分组
                </button>
                ) : undefined}
            </div>
            {!collapsed[g.key] && (
                <div style={{ marginTop: 6 }}>
                <FriendList
                    onAddGroup={onAddGroup}
                    friendsProp={g.members}
                    noScroll={true}
                    onDeleteFriend={deleteFriend}
                    onChatSelected={onChatSelected}
                    {...(!g.isUngrouped
                    ? {
                        primaryActionLabel: "移出分组",
                        onPrimaryAction: (friend: FriendItem) => removeFromGroup(g.groupId, friend),
                        }
                    : {})}
                />
                </div>
            )}
            </div>
        ))}
        </div>
        </div>
    );
};

export default GroupedFriendList;
