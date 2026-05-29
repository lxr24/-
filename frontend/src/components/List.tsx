// components/List.tsx
import React, { useState } from "react";
import FriendList from "./friendlist/FriendList";
import GroupList from "./group/GroupList";
import { FriendItem } from "../utils/types";

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
    <svg 
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" 
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        style={{ 
            transition: "transform 0.3s ease", 
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            marginRight: "8px"
        }}
    >
        <path d="M9 18l6-6-6-6"/>
    </svg>
);

// 接收的 Props 类型
interface SidebarListProps {
    onChatSelected: (chatId: string) => void;
    onAddGroup: (friendId?: number | string, friend?: FriendItem) => void;
}

// 将类型应用到组件参数上
const List: React.FC<SidebarListProps> = ({ onChatSelected, onAddGroup }) => {
    const [showFriends, setShowFriends] = useState(true);
    const [showGroups, setShowGroups] = useState(true);

    const headerStyle: React.CSSProperties = {
        cursor: "pointer",
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        borderRadius: "8px",
        backgroundColor: "#f9f9f9",
        transition: "background 0.2s ease",
        color: "#333",
        fontSize: "14px",
        fontWeight: 600,
        marginBottom: "4px"
    };

    return (
        <div style={{ padding: "10px" }}>
            {/* 好友部分 */}
            <div 
                onClick={() => setShowFriends(!showFriends)} 
                style={headerStyle}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f0f0f0"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#f9f9f9"}
            >
                <ChevronIcon isOpen={showFriends} /> 好友列表
            </div>
            <div style={{ overflow: "hidden", transition: "all 0.3s ease" }}>
                {showFriends && (
                    <FriendList onChatSelected={onChatSelected} onAddGroup={onAddGroup} />
                )}
            </div>

            {/* 群聊部分 */}
            <div 
                onClick={() => setShowGroups(!showGroups)} 
                style={headerStyle}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f0f0f0"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#f9f9f9"}
            >
                <ChevronIcon isOpen={showGroups} /> 群聊列表
            </div>
            <div style={{ overflow: "hidden", transition: "all 0.3s ease" }}>
                {showGroups && <GroupList onGroupSelected={onChatSelected} />}
            </div>
        </div>
    );
};

export default List; // 确保这是默认导出