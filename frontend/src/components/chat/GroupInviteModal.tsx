import React, { useEffect, useMemo, useState } from "react";
import { request } from "../../utils/network";
import { BACKEND_URL } from "../../constants/string";
import { FriendItem } from "../../utils/types";
import FriendChooseList from "../friendlist/FriendChooseList";
import ModalShell from "./modals/ModalShell";

interface GroupInviteModalProps {
    open: boolean;
    conversationId: string;
    onClose: () => void;
    onInvited?: () => void;
}

const GroupInviteModal: React.FC<GroupInviteModalProps> = ({ open, conversationId, onClose, onInvited }) => {
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [selectedFriends, setSelectedFriends] = useState<Record<number, FriendItem>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) {
            setSelectedIds(new Set());
            setSelectedFriends({});
            setSubmitting(false);
        }
    }, [open]);

    const selectedList = useMemo(() => Object.values(selectedFriends), [selectedFriends]);

    const toggleFriend = (friend: FriendItem) => {
        const friendId = Number(friend.user_id ?? friend.id);
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

    const handleInvite = async () => {
        if (selectedIds.size < 1) {
            alert("至少选择一位好友");
            return;
        }
        setSubmitting(true);
        try {
            await request(`${BACKEND_URL}/api/conversations/${conversationId}/invites`, "POST", true, {
                invitee_ids: Array.from(selectedIds),
            });
            alert("邀请已发送，等待审核");
			if(onInvited){
				onInvited();
			}
            onClose();
        } catch (err: any) {
			if(err?.message?.includes("已在群聊中")){
				alert("好友已在群聊中，无法重复邀请");
			} else {
				alert(err?.message || "发送邀请失败");
			}
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ModalShell open={open} title="邀请好友入群" width="60vw" height="80vh" onClose={onClose}>

                <div style={{ flex: "0 0 30%", borderRadius: 12, border: "1px solid #eee", padding: 12, overflow: "hidden" }}>
                    <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>已选择好友</div>
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
                        {selectedList.length === 0 ? (
                            <div style={{ color: "#bbb", fontSize: 13 }}>选择至少一位好友</div>
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
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                        <button
                            type="button"
                            onClick={handleInvite}
                            disabled={selectedIds.size < 1 || submitting}
                            style={{
                                padding: "10px 16px",
                                borderRadius: 8,
                                border: "none",
                                background: selectedIds.size < 1 || submitting ? "#ccc" : "#1890ff",
                                color: "#fff",
                                cursor: selectedIds.size < 1 || submitting ? "not-allowed" : "pointer",
                                fontWeight: 600,
                            }}
                        >
                            {submitting ? "发送中..." : "发送邀请"}
                        </button>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto" }}>
                        <FriendChooseList selectedIds={selectedIds} onToggle={toggleFriend} />
                    </div>
                </div>
        </ModalShell>
    );
};

export default GroupInviteModal;
