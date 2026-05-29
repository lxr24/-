import React, { useMemo, useState } from "react";

import { request } from "../../utils/network";
import { BACKEND_URL } from "../../constants/string";

interface GroupAnnouncementSectionProps {
    chatId: string;
    groupInfo?: GroupInfo;
    isLoading: boolean;
    currentUserId?: number;
    onRefresh?: () => void | Promise<void>;
}

interface GroupMember {
    user_id: number;
    username: string;
    nickname: string;
    avatar_url: string;
    role: string;
    joined_at: string;
    is_active: boolean;
}

interface GroupAnnouncement {
    announcement_id: number;
    content: string;
    creator_id: number;
    creator_name: string;
    created_at: string;
}

export interface GroupInfo {
    conversation_id: number;
    conversation_name: string;
    members: GroupMember[];
    announcements: GroupAnnouncement[];
}

export const GroupAnnouncementSection: React.FC<GroupAnnouncementSectionProps> = ({
    chatId,
    groupInfo,
    isLoading,
    currentUserId,
    onRefresh,
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [content, setContent] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeAnnouncement, setActiveAnnouncement] = useState<GroupAnnouncement | undefined>(undefined);

    const canPublish = useMemo(() => {
        if (!groupInfo?.members || !currentUserId) return false;
        return groupInfo.members.some(member => {
            const role = member.role?.toLowerCase();
            return String(member.user_id) === String(currentUserId)
                && (role === "owner" || role === "admin");
        });
    }, [groupInfo?.members, currentUserId]);

    const handlePublish = async () => {
        if (!chatId || !content.trim()) return;
        try {
            setIsSubmitting(true);
            await request(
                `${BACKEND_URL}/api/conversations/${chatId}/announcements`,
                "POST",
                true,
                { content: content.trim() }
            );
            setContent("");
            setIsModalOpen(false);
            if (onRefresh) {
                await onRefresh();
            }
        } catch (error) {
            console.error("发布群公告失败", error);
            alert("发布群公告失败，请稍后重试");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <div style={{ marginTop: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#333" }}>
                        群公告
                    </div>
                    <button
                        type="button"
                        disabled={!canPublish}
                        onClick={() => setIsModalOpen(true)}
                        style={{
                            border: "none",
                            backgroundColor: canPublish ? "#faad14" : "#d9d9d9",
                            color: "#fff",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            cursor: canPublish ? "pointer" : "not-allowed",
                            fontSize: "11px",
                            fontWeight: 600,
                        }}
                    >
                        发布群公告
                    </button>
                </div>
                <div style={{
                    backgroundColor: "#fff",
                    border: "1px solid #f0f0f0",
                    borderRadius: "8px",
                    padding: "10px",
                    height: "150px",
                    overflowY: "auto",
                    fontSize: "12px",
                    color: "#666",
                }}>
                    {groupInfo?.announcements?.length ? (
                        groupInfo.announcements.map(item => (
                            <div
                                key={item.announcement_id}
                                onClick={() => setActiveAnnouncement(item)}
                                style={{
                                    marginBottom: "12px",
                                    backgroundColor: "#fff",
                                    borderRadius: "10px",
                                    padding: "10px 12px",
                                    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
                                    border: "1px solid #f2f2f2",
                                    cursor: "pointer",
                                    height: "78px",
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "space-between",
                                    overflow: "hidden",
                                }}
                            >
                                <div
                                    style={{
                                        lineHeight: 1.4,
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        fontSize: "12px",
                                        color: "#555",
                                    }}
                                >
                                    {item.content}
                                </div>
                                <div style={{ fontSize: "11px", color: "#999", marginTop: "4px" }}>
                                    {item.creator_name} · {new Date(item.created_at.replace(" ", "T")).toLocaleString()}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div style={{ color: "#999" }}>
                            {isLoading ? "加载中..." : "暂无群公告"}
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div
                    onClick={() => setIsModalOpen(false)}
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.35)",
                        zIndex: 120,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "320px",
                            backgroundColor: "#fff",
                            borderRadius: "12px",
                            padding: "20px",
                            boxShadow: "0 12px 24px rgba(0,0,0,0.12)",
                        }}
                    >
                        <div style={{ fontSize: "16px", fontWeight: 600, color: "#333", marginBottom: "12px" }}>
                            发布群公告
                        </div>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="请输入群公告内容"
                            rows={4}
                            style={{
                                width: "100%",
                                border: "1px solid #e6e6e6",
                                borderRadius: "8px",
                                padding: "10px",
                                fontSize: "13px",
                                resize: "none",
                                boxSizing: "border-box",
                            }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                style={{
                                    border: "1px solid #e6e6e6",
                                    backgroundColor: "#fff",
                                    color: "#666",
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                }}
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={handlePublish}
                                disabled={isSubmitting || !content.trim()}
                                style={{
                                    border: "none",
                                    backgroundColor: isSubmitting || !content.trim() ? "#d9d9d9" : "#faad14",
                                    color: "#fff",
                                    padding: "6px 14px",
                                    borderRadius: "6px",
                                    cursor: isSubmitting || !content.trim() ? "not-allowed" : "pointer",
                                    fontWeight: 600,
                                }}
                            >
                                {isSubmitting ? "发布中..." : "发布"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeAnnouncement && (
                <div
                    onClick={() => setActiveAnnouncement(undefined)}
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.45)",
                        zIndex: 130,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "500px",
                            maxWidth: "88vw",
                            backgroundColor: "#fff",
                            borderRadius: "14px",
                            padding: "20px",
                            boxShadow: "0 16px 32px rgba(0,0,0,0.18)",
                        }}
                    >
                        <div style={{ fontSize: "16px", fontWeight: 600, color: "#333", marginBottom: "10px" }}>
                            群公告
                        </div>
                        <div
                            style={{
                                fontSize: "13px",
                                color: "#555",
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                                maxHeight: "300px",
                                overflowY: "auto",
                                paddingRight: "4px",
								borderRadius: "8px",
								border: "1px solid #e5e5e5",
								padding: "8px",
                            }}
                        >
                            {activeAnnouncement.content}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                            <div style={{ fontSize: "11px", color: "#999" }}>
                                {activeAnnouncement.creator_name} · {new Date(activeAnnouncement.created_at).toLocaleString()}
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveAnnouncement(undefined)}
                                style={{
                                    border: "1px solid #e6e6e6",
                                    backgroundColor: "#fff",
                                    color: "#666",
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                }}
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
