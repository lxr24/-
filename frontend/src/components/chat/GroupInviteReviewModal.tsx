import React, { useEffect, useState } from "react";
import { request } from "../../utils/network";
import { BACKEND_URL } from "../../constants/string";
import ModalShell from "./modals/ModalShell";

interface GroupInviteInfo {
    invitation_id: number;
    inviter_id: number;
    inviter_username?: string;
    inviter_avatar_url?: string;
    invitee_id: number;
    invitee_username?: string;
    invitee_avatar_url?: string;
    status: string;
    reviewer_id?: number;
    created_at?: string;
    reviewed_at?: string;
}

interface GroupInviteReviewModalProps {
    open: boolean;
    conversationId: string;
    canReview: boolean;
    reviewerId?: number;
    onClose: () => void;
    onReviewed?: (action: "approved" | "rejected") => void;
}

const GroupInviteReviewModal: React.FC<GroupInviteReviewModalProps> = ({ open, conversationId, canReview, reviewerId, onClose, onReviewed }) => {
    const [invites, setInvites] = useState<GroupInviteInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const [workingId, setWorkingId] = useState<number | undefined>(undefined);

    const fetchInvites = async () => {
        if (!conversationId) return;
        setLoading(true);
        setError(undefined);
        try {
            const res = await request(`${BACKEND_URL}/api/conversations/${conversationId}/invites?status=all`, "GET", true);
            setInvites(Array.isArray(res) ? res : []);
        } catch (err: any) {
            setError(err?.message || "获取邀请列表失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchInvites();
        } else {
            setInvites([]);
            setError(undefined);
            setLoading(false);
            setWorkingId(undefined);
        }
    }, [open, conversationId]);

    const handleReview = async (invitationId: number, action: "approved" | "rejected") => {
        if (!canReview) return;
        setWorkingId(invitationId);
        try {
            await request(`${BACKEND_URL}/api/conversations/${conversationId}/invites/${invitationId}/review`, "PUT", true, { action });
            const reviewedAt = new Date().toISOString();
            setInvites(prev => prev.map(item => (
                item.invitation_id === invitationId
                    ? { ...item, status: action, reviewer_id: reviewerId ?? item.reviewer_id, reviewed_at: reviewedAt }
                    : item
            )));
			if(onReviewed){
				onReviewed(action);
			}
        } catch (err: any) {
            alert(err?.message || "操作失败");
        } finally {
            setWorkingId(undefined);
        }
    };

    const formatTime = (timeInput?: string | undefined) => {
        if (!timeInput) return "";
        let safeString = timeInput.replace(" ", "T");
        let date = new Date(safeString);
        if (isNaN(date.getTime())) {
            safeString = timeInput.replace(/-/g, "/").replace("T", " ");
            safeString = safeString.split(".")[0];
            date = new Date(safeString);
        }
        if (isNaN(date.getTime())) return timeInput;
        return date.toLocaleString();
    };

    const getAvatarUrl = (url?: string) => {
        if (!url) return "";
        if (url.startsWith("http")) return url;
        if (url.startsWith("/api")) return url;
        return `/api${url.startsWith("/") ? "" : "/"}${url}`;
    };

    return (
        <ModalShell open={open} title="入群审批" width="50vw" height="80vh" onClose={onClose}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "#999" }}>待审核邀请</div>
                    <button
                        type="button"
                        onClick={fetchInvites}
                        disabled={loading}
                        style={{
                            border: "1px solid #d9d9d9",
                            background: "#fff",
                            borderRadius: 6,
                            padding: "4px 10px",
                            cursor: loading ? "not-allowed" : "pointer",
                            fontSize: 12,
                        }}
                    >
                        {loading ? "刷新中..." : "刷新"}
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto" }}>
                    {loading ? (
                        <div style={{ textAlign: "center", color: "#999", padding: 20 }}>加载中...</div>
                    ) : error ? (
                        <div style={{ textAlign: "center", color: "#ff4d4f", padding: 20 }}>{error}</div>
                    ) : invites.length === 0 ? (
                        <div style={{ textAlign: "center", color: "#999", padding: 20 }}>暂无待审核邀请</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {invites.map(invite => (
                                <div
                                    key={invite.invitation_id}
                                    style={{
                                        border: "1px solid #eee",
                                        borderRadius: 12,
                                        padding: 12,
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        gap: 12,
                                    }}
                                >
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                {invite.inviter_avatar_url ? (
                                                    <img
                                                        src={getAvatarUrl(invite.inviter_avatar_url)}
                                                        alt={invite.inviter_username || "inviter"}
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
                                                            color: "#fff",
                                                            fontWeight: 700,
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        {(invite.inviter_username || "?").slice(-2).toUpperCase()}
                                                    </div>
                                                )}
                                                <div style={{ fontSize: 13, fontWeight: 600 }}>
                                                    {invite.inviter_username || "未知用户"}
                                                </div>
                                            </div>
                                            <span style={{ color: "#ccc" }}>邀请</span>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                {invite.invitee_avatar_url ? (
                                                    <img
                                                        src={getAvatarUrl(invite.invitee_avatar_url)}
                                                        alt={invite.invitee_username || "invitee"}
                                                        style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
                                                    />
                                                ) : (
                                                    <div
                                                        style={{
                                                            width: 36,
                                                            height: 36,
                                                            borderRadius: "50%",
                                                            backgroundColor: "#52c41a",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            color: "#fff",
                                                            fontWeight: 700,
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        {(invite.invitee_username || "?").slice(-2).toUpperCase()}
                                                    </div>
                                                )}
                                                <div style={{ fontSize: 13, fontWeight: 600 }}>
                                                    {invite.invitee_username || "未知用户"}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 12, color: "#999" }}>
                                            发起时间: {formatTime(invite.created_at)}
                                        </div>
                                        {invite.status !== "pending" && (
                                            <div style={{ fontSize: 12, color: "#999" }}>
                                                审批时间: {formatTime(invite.reviewed_at)}
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: "flex", gap: 8 }}>
                                        {invite.status === "pending" ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => handleReview(invite.invitation_id, "approved")}
                                                    disabled={!canReview || workingId === invite.invitation_id}
                                                    style={{
                                                        padding: "6px 12px",
                                                        borderRadius: 6,
                                                        border: "none",
                                                        background: !canReview ? "#d9d9d9" : "#52c41a",
                                                        color: "#fff",
                                                        cursor: !canReview ? "not-allowed" : "pointer",
                                                    }}
                                                >
                                                    通过
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleReview(invite.invitation_id, "rejected")}
                                                    disabled={!canReview || workingId === invite.invitation_id}
                                                    style={{
                                                        padding: "6px 12px",
                                                        borderRadius: 6,
                                                        border: "none",
                                                        background: !canReview ? "#d9d9d9" : "#ff4d4f",
                                                        color: "#fff",
                                                        cursor: !canReview ? "not-allowed" : "pointer",
                                                    }}
                                                >
                                                    拒绝
                                                </button>
                                            </>
                                        ) : (
                                            <div
                                                style={{
                                                    padding: "6px 12px",
                                                    borderRadius: 6,
                                                    background: invite.status === "approved" ? "#f6ffed" : "#fff1f0",
                                                    color: invite.status === "approved" ? "#52c41a" : "#ff4d4f",
                                                    border: "1px solid",
                                                    borderColor: invite.status === "approved" ? "#b7eb8f" : "#ffa39e",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {invite.status === "approved" ? "已通过" : "已拒绝"}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
        </ModalShell>
    );
};

export default GroupInviteReviewModal;
