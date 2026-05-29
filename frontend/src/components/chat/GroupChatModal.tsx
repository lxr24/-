import React, { useEffect, useMemo, useState } from "react";
import { request } from "../../utils/network";
import { BACKEND_URL } from "../../constants/string";
import { FriendItem } from "../../utils/types";
import FriendChooseList from "../friendlist/FriendChooseList";

interface GroupChatModalProps {
    open: boolean;
    onClose: () => void;
    onCreated?: (conversationId: string) => void;
}

// 发起群聊时选择好友的窗口，包含好友选择和群名输入
const GroupChatModal: React.FC<GroupChatModalProps> = ({ open, onClose, onCreated }) => {
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set()); // 选中的好友ID集合，方便调用后端api
    const [selectedFriends, setSelectedFriends] = useState<Record<number, FriendItem>>({}); // 选中的好友信息，方便展示已选好友列表
    const [groupName, setGroupName] = useState("");
    const [creating, setCreating] = useState(false);

    // 每次关闭窗口=>重置状态
    useEffect(() => {
        if (!open) {
            setSelectedIds(new Set());
            setSelectedFriends({});
            setGroupName("");
            setCreating(false);
        }
    }, [open]);

    const selectedList = useMemo(() => Object.values(selectedFriends), [selectedFriends]);

    // 切换好友选择状态
    const toggleFriend = (friend: FriendItem) => {
        const friendId = Number(friend.user_id);
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(friendId)) {
                next.delete(friendId);
                setSelectedFriends(current => {
                    const updated = { ...current };
                    delete updated[friendId];
                    return updated;
                });
            } else {
                next.add(friendId);
                setSelectedFriends(current => ({ ...current, [friendId]: friend }));
            }
            return next;
        });
    };

    const handleCreateGroup = async () => {
        if (selectedIds.size < 2) return;
        if (!groupName.trim()) {
            alert("请输入群名");
            return;
        }
        setCreating(true);
        try {
            // 后端规定，不用传自己的ID
            const res = await request(`${BACKEND_URL}/api/conversations/create`, "POST", true, {
                type: "group",
                member_ids: Array.from(selectedIds),
                group_name: groupName.trim(),
            });
            if (res?.conversation_id) {
                if (onCreated) {
                    onCreated(String(res.conversation_id));
                }
                onClose();
            }
			window.dispatchEvent(new Event("local_refresh_groups"));
        } catch (err: any) {
            alert(err?.message || "创建群聊失败");
        } finally {
            setCreating(false);
			window.dispatchEvent(new Event("local_refresh_conversations"));
        }
    };

    if (!open) return undefined;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "60vw",
                    height: "80vh",
                    background: "#fff",
                    borderRadius: 16,
                    padding: 20,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>发起群聊</div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ flex: "0 0 30%", borderRadius: 12, border: "1px solid #eee", padding: 12, overflow: "hidden" }}>
                    <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>已选择好友</div>
                    <div
                        style={{
                            display: "flex",
                            gap: 10,
                            overflowX: "auto",
                            paddingBottom: 6,
                        }}
                    >
                        {selectedList.length === 0 ? (
                            <div style={{ color: "#bbb", fontSize: 13 }}>选择两个及以上好友创建群聊</div>
                        ) : (
                            selectedList.map((friend) => (
                                <div key={String(friend.id ?? friend.user_id)} style={{ textAlign: "center" }}>
                                    {friend.avatar_url ? (
                                        <img
                                            src={friend.avatar_url}
                                            alt={friend.nickname || friend.username}
                                            style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover" }}
                                        />
                                    ) : (
                                        <div
                                            style={{
                                                width: 60,
                                                height: 60,
                                                borderRadius: "50%",
                                                backgroundColor: "#1890ff",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                color: "white",
                                                fontWeight: 700,
                                                fontSize: "16px",
                                            }}
                                        >
                                            {friend.nickname ? friend.nickname.slice(-2).toUpperCase() : "?"}
                                        </div>
                                    )}
                                    <div style={{ fontSize: 11, color: "#666", marginTop: 4, maxWidth: 60 }}>
                                        {friend.nickname || friend.username}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div style={{ flex: "1 1 70%", display: "flex", flexDirection: "column", marginTop: 16, minHeight: 0 }}>
                    <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                        <input
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            placeholder="输入群名"
                            style={{
                                flex: 1,
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: "1px solid #e6e6e6",
                                fontSize: 14,
                            }}
                        />
                        <button
                            type="button"
                            onClick={handleCreateGroup}
                            disabled={selectedIds.size < 2 || creating}
                            style={{
                                padding: "10px 16px",
                                borderRadius: 8,
                                border: "none",
                                background: selectedIds.size < 2 || creating ? "#ccc" : "#1890ff",
                                color: "#fff",
                                cursor: selectedIds.size < 2 || creating ? "not-allowed" : "pointer",
                                fontWeight: 600,
                            }}
                        >
                            {creating ? "创建中..." : "发起群聊"}
                        </button>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto" }}>
                        <FriendChooseList selectedIds={selectedIds} onToggle={toggleFriend} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GroupChatModal;
