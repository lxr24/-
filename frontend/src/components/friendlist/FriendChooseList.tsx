import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { request } from "../../utils/network";
import { BACKEND_URL } from "../../constants/string";
import { FriendItem } from "../../utils/types";
import { RootState } from "../../redux/store";

interface FriendChooseListProps {
    selectedIds: Set<number>;
    onToggle: (friend: FriendItem) => void;
    friendsProp?: FriendItem[];
}

// 用于选择好友的好友列表
const FriendChooseList: React.FC<FriendChooseListProps> = ({ selectedIds, onToggle, friendsProp }) => {
    const token = useSelector((s: RootState) => s.auth.token);
    const [friends, setFriends] = useState<FriendItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);

    const fetchFriends = async () => {
        if (!token) {
            setError("未登录，无法获取好友列表");
            return;
        }
        setLoading(true);
        setError(undefined);
        try {
            const friendsList = await request(`${BACKEND_URL}/api/friends/list`, "GET", true);
            const normalized: FriendItem[] = Array.isArray(friendsList)
                ? friendsList.map((f: any) => ({
                    ...(f || {}),
                    id: (f && f.user_id),
                    avatar_url: f?.avatar_url ? `/api${f.avatar_url}` : "",
                }))
                : [];
            setFriends(normalized);
        } catch {
            setError("获取好友列表失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (friendsProp) {
            setFriends(friendsProp.map((f: any) => ({
                ...(f || {}),
                id: (f && (f.id ?? f.user_id)),
                avatar_url: f?.avatar_url ? `/api${f.avatar_url}` : "",
            })));
            setLoading(false);
            setError(undefined);
            return;
        }
        if (token) {
            fetchFriends();
        }
    }, [token, friendsProp]);

    if (loading) {
        return <div style={{ color: "#999", textAlign: "center", padding: "20px" }}>加载中...</div>;
    }

    if (error) {
        return (
            <div style={{ color: "#ff4d4f", textAlign: "center", padding: "20px" }}>
                {error}
                <button
                    type="button"
                    onClick={fetchFriends}
                    style={{
                        marginLeft: "8px",
                        padding: "4px 8px",
                        fontSize: "12px",
                        border: "1px solid #ff4d4f",
                        background: "transparent",
                        color: "#ff4d4f",
                        borderRadius: "4px",
                        cursor: "pointer",
                    }}
                >
                    重试
                </button>
            </div>
        );
    }

    if (friends.length === 0) {
        return <div style={{ color: "#999", textAlign: "center", padding: "20px" }}>暂无好友</div>;
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {friends.map((friend, idx) => {
                const friendId = Number(friend.id ?? friend.user_id ?? idx);
                const selected = selectedIds.has(friendId);
                return (
                    <div
                        key={friend.id ?? String(idx)}
                        onClick={() => onToggle({ ...friend, id: friendId })}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "12px",
                            borderRadius: "8px",
                            backgroundColor: selected ? "#e6f7ff" : "#f7f7f7",
                            border: selected ? "1px solid #1890ff" : "1px solid transparent",
                            cursor: "pointer",
                            transition: "all 0.2s",
                        }}
                    >
                        {friend.avatar_url ? (
                            <img
                                src={friend.avatar_url}
                                alt={friend.nickname || friend.username}
                                style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
                            />
                        ) : (
                            <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: "50%",
                                    backgroundColor: "#1890ff",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "white",
                                    fontWeight: 700,
                                    fontSize: "14px",
                                }}
                            >
                                {friend.nickname ? friend.nickname.slice(-2).toUpperCase() : "?"}
                            </div>
                        )}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "14px", fontWeight: 600 }}>{friend.nickname || friend.username}</div>
                            <div style={{ fontSize: "12px", color: "#999" }}>@{friend.username}</div>
                        </div>
                        {selected ? (
                            <div style={{ fontSize: "18px", color: "#52c41a" }}>✅</div>
                        ) : undefined}
                    </div>
                );
            })}
        </div>
    );
};

export default FriendChooseList;
