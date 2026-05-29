import React, { useEffect, useState } from "react";
import { request } from "../utils/network";
import { BACKEND_URL } from "../constants/string";
import { FriendItem } from "../utils/types";

interface Group {
    id: number;
    group_name: string;
    created_at: string;
}

interface Props {
    open: boolean;
    friend?: FriendItem;
    onClose: () => void;
    onGroupChanged?: () => void;
}

const GroupModal: React.FC<Props> = ({ open, friend, onClose, onGroupChanged }) => {
    const [groups, setGroups] = useState<Group[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [groupsError, setGroupsError] = useState<string | undefined>(undefined);
    const [newGroupName, setNewGroupName] = useState("");
    const [creatingGroup, setCreatingGroup] = useState(false);

    const formatDate = (s?: string) => { // 用于格式化创建日期
        if (!s) return "";
        const d = new Date(s);
        if (isNaN(d.getTime())) return s;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    };

    const fetchGroups = async () => {
        setGroupsLoading(true);
        setGroupsError(undefined);
        try {
        const res = await request(`${BACKEND_URL}/api/friends/groups`, "GET", true);
        setGroups(Array.isArray(res) ? res : []);
        } catch (err: any) {
        console.error("fetchGroups error", err);
        setGroupsError(err?.message || "获取分组失败");
        } finally {
        setGroupsLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
        fetchGroups();
        } else {
            // reset local state when closed
            setGroups([]);
            setGroupsError(undefined);
            setNewGroupName("");
            setCreatingGroup(false);
        }
    }, [open]);

    const createGroup = async () => {
        if (!newGroupName || newGroupName.trim().length === 0) {
            alert("请输入分组名称");
            return;
        }
        setCreatingGroup(true);
        try {
            await request(`${BACKEND_URL}/api/friends/groups?group_name=${encodeURIComponent(newGroupName.trim())}`, "POST", true);
            await fetchGroups();
            setNewGroupName("");
            if (onGroupChanged) {
                onGroupChanged();
            }
        } catch (err: any) {
        console.error("createGroup error", err);
        alert(err?.message || "创建分组失败");
        } finally {
            setCreatingGroup(false);
        }
    };

    // 删除分组函数
    const deleteGroup = async (groupId: number) => {
        try {
            await request(`${BACKEND_URL}/api/friends/groups/${groupId}`, "DELETE", true);
            await fetchGroups();
            if (onGroupChanged) {
                onGroupChanged();
            }
        } catch (err: any) {
            console.error("deleteGroup error", err);
            alert(err?.message || "删除分组失败");
        }
    };

    // 添加好友到分组函数
    const addGroup = async (groupId: number) => {
        if (!friend) return;
        try {
            // alert('debug: addGroup called with groupId=' + groupId + ' and friend.user_id=' + friend.user_id);
            await request(`${BACKEND_URL}/api/friends/groups/${groupId}/members/${friend.user_id}?group_id=${groupId}&friend_id=${friend.user_id}`, "POST", true);
            alert(`好友已添加到分组 "${groups.find(g => g.id === groupId)?.group_name || groupId}"`);
            if (onGroupChanged) {
                    onGroupChanged();
                }
            onClose();
        } catch (err: any) {
            console.warn("addGroup handled error", err);
            alert(err?.message || "添加好友到分组失败");
            return;
        }
    };

    if (!open) return;

    return (
        <div
        style={{
            position: "fixed",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
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
            width: 520,
            maxWidth: "94%",
            background: "#fff",
            borderRadius: 8,
            padding: 20,
            boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
            color: "#222",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>正在为好友 {friend?.nickname || "昵称"} (@{friend?.username || "用户"}) 添加分组</div>
            <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="新分组名称"
                style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #e6e6e6" }}
            />
            <button
                onClick={createGroup}
                disabled={creatingGroup}
                style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: "#1890ff", color: "white", cursor: creatingGroup ? "not-allowed" : "pointer" }}
            >
                {creatingGroup ? "创建中..." : "新建分组"}
            </button>
            </div>

            <div>
            {groupsLoading ? (
                <div style={{ color: "#888", height: 300 }}></div>
            ) : groupsError ? (
                <div style={{ color: "#c4341a" }}>获取分组失败：{groupsError}</div>
            ) : (
                // 固定高度的分组列表容器，超过内容可滚动
                <div style={{ height: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 6 }}>
                {groups.length === 0 ? (
                    <div style={{ color: "#888" }}>当前还没有分组</div>
                ) : (
                    groups.map((g) => (
                    <div key={g.id} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 12 , transition: "background-color 0.2s ease"}}
                        onClick = {() => { void addGroup(g.id); }}
                        // 鼠标悬浮时变色
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f7f7f7")}
                        // 鼠标离开恢复
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                    >
                        <div style={{ fontSize: 14 }}>{g.group_name}</div>
                        <div style={{ fontSize: 12, color: "#999" }}>{formatDate(g.created_at)}</div>
                        <button type="button" style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "#fa1717ff", color: "white", cursor: "pointer", marginLeft: "auto" }}
                        onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}
                        >
                        删除分组
                        </button>
                    </div>
                    ))
                )}
                </div>
            )}
            </div>
        </div>
        </div>
    );
};

export default GroupModal;
