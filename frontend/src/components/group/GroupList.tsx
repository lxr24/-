import React, { useEffect, useState, useCallback } from "react";
import { request } from "../../utils/network";
import { BACKEND_URL } from "../../constants/string";

interface Props {
    onGroupSelected: (chatId: string) => void;
}

const GroupList: React.FC<Props> = ({ onGroupSelected }) => {
    const [groups, setGroups] = useState<any[]>([]);
	const fetchGroups = useCallback(async () => {
        try {
            const res = await request(`${BACKEND_URL}/api/conversations/list`, "GET", true);
            console.log("【抓包测试】后端传来的会话数据:", res); // 👈 加上这句
            // 严格过滤：必须是群聊，且角色绝对不能是已退出(quit)或被踢(kicked)
            const activeGroups = res.filter((c: any) => {
                return c.type === "group" && c.role !== "quit" && c.role !== "kicked";
            });
            setGroups(activeGroups);
        } catch (err) {
            console.error("获取群组列表失败:", err);
        }
    }, []);

    useEffect(() => {
        // 初次加载
        fetchGroups();

        // 监听全局刷新事件
        const handleRefresh = () => {
            console.log("🔄 GroupList 听到了刷新广播，正在拉取最新群聊...");
            fetchGroups();
        };
        
        window.addEventListener("local_refresh_groups", handleRefresh);
        return () => {
            window.removeEventListener("local_refresh_groups", handleRefresh);
        };
    }, [fetchGroups]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {groups.length === 0 ? (
                // 💡 顺手帮你加上了没群聊时的贴心提示
                <div style={{ textAlign: "center", color: "#999", padding: "20px 0", fontSize: "13px" }}>
                    暂无加入的群聊
                </div>
            ) : (
                groups.map(group => (
                    <div key={group.conversation_id} onClick={() => onGroupSelected(String(group.conversation_id))} 
                         style={{ padding: "12px", cursor: "pointer", backgroundColor: "#f9f9f9", borderRadius: "8px", transition: "background 0.2s" }}
                         onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f0f0f0"}
                         onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#f9f9f9"}
                    >
                        {group.conversation_name}
                    </div>
                ))
            )}
        </div>
    );
};
export default GroupList;