import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { request } from "../../utils/network";
import { BACKEND_URL } from "../../constants/string";
import { FriendItem } from "../../utils/types";
import { RootState } from "../../redux/store";

interface Props {
    onAddGroup: (friendId?: number | string, friend?: FriendItem) => void;
    // 如果父组件提供，就用这个好友列表；否则自己请求获取
    friendsProp?: FriendItem[];
    // 为true时表示父组件已经在外层包了滚动容器，这时自己不再添加滚动样式，适用于被GroupedFriendList调用的场景
    noScroll?: boolean;
    // 覆盖主按钮文案（默认“添加分组”）
    primaryActionLabel?: string;
    // 覆盖主按钮行为（默认调用 onAddGroup）
    onPrimaryAction?: (friend: FriendItem) => void | Promise<void>;
    // 可选：覆盖删除好友行为（grouped 场景由父组件统一处理）
    onDeleteFriend?: (friend: FriendItem) => void | Promise<void>;
    // 可选：点击好友时的行为，参数是 chatId（默认进入聊天界面）
    onChatSelected?: (chatId: string) => void;
}

const FriendList: React.FC<Props> = ({ onAddGroup, friendsProp, noScroll, primaryActionLabel, onPrimaryAction, onDeleteFriend, onChatSelected }) => {
    const router = useRouter();
    const token = useSelector((s: RootState) => s.auth.token);

    const [friends, setFriends] = useState<FriendItem[]>([]);
    const [avatarLoadErrorMap, setAvatarLoadErrorMap] = useState<Record<string, boolean>>({});
    const [hoveredIndex, setHoveredIndex] = useState<number | undefined>(undefined);
    const hoverTimeout = useRef<number | undefined>(undefined);
    const [loadingFriends, setLoadingFriends] = useState(false);
    const [friendsError, setFriendsError] = useState<string | undefined>(undefined);

    // 获取好友列表函数
    const fetchFriends = async () => {
        if (!token) {
            setFriendsError("未登录，无法获取好友列表");
            return;
        }
        setLoadingFriends(true);
    	setFriendsError(undefined);
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
            setFriendsError("获取好友列表失败");
        } finally {
            setLoadingFriends(false);
        }
    };
	//监听好友列表刷新事件
	useEffect(() => {
		const handleRefresh = () => fetchFriends();
		window.addEventListener("local_refresh_friends", handleRefresh);
		return () => window.removeEventListener("local_refresh_friends", handleRefresh);
	}, [fetchFriends]);

    // 删除好友函数
    const deleteFriend = async (friendshipId: number | string) => {
        // 先本地移除，保证界面立刻刷新
        const prevFriends = friends;
        setFriends((prev) => prev.filter((f: any) => String(f.friendship_id) !== String(friendshipId)));
        try {
            await request(`${BACKEND_URL}/api/friends/${friendshipId}?friendship_id=${friendshipId}`, "DELETE", true);
        } catch {
        // 请求失败时回滚
            setFriends(prevFriends);
            setFriendsError("删除好友失败");
        }
    };

    const startHoverTimer = (index: number) => {
        if (hoverTimeout.current) {
        window.clearTimeout(hoverTimeout.current);
        hoverTimeout.current = undefined;
        }
        hoverTimeout.current = window.setTimeout(() => {
        setHoveredIndex(index);
        hoverTimeout.current = undefined;
        }, 500) as unknown as number;
    };

    const clearHoverTimerAndHide = (index: number) => {
        if (hoverTimeout.current) {
        window.clearTimeout(hoverTimeout.current);
        hoverTimeout.current = undefined;
        }
        setHoveredIndex((prev) => (prev === index ? undefined : prev));
    };

    const handleStartChat = async (friendId: number | string) => {
        try {
            const res = await request(`${BACKEND_URL}/api/conversations/create`, "POST", true, {
                type: "private",
                target_user_id: Number(friendId)
            });
            
            if(res && res.conversation_id){
                // 如果外层传了 onChatSelected 就调用它，否则兜底用原来的 router 跳转
                if (onChatSelected) {
                    onChatSelected(String(res.conversation_id));
                } else {
                    router.push(`/chat/${res.conversation_id}`);
                }
            }
        } catch (err) {
            console.error("进入聊天失败:", err);
            alert("进入聊天失败");
        }
    }

    useEffect(() => {
        if (friendsProp) {
        setFriends(friendsProp.map((f: any) => ({
            ...(f || {}),
            id: (f && (f.id ?? f.user_id)),
            avatar_url: f?.avatar_url ? `/api${f.avatar_url}` : "",
        })));
        setLoadingFriends(false);
    setFriendsError(undefined);
        return;
        }
        if (token) fetchFriends();
    }, [token, friendsProp]);

    return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={ noScroll ? { padding: "8px 4px" } : { flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 4px" } }>
            {loadingFriends ? (
            <div style={{ color: "#999", textAlign: "center", marginTop: "20px" }}>加载中...</div>
            ) : friendsError ? (
            <div style={{ color: "#ff4d4f", textAlign: "center", marginTop: "20px" }}>
                {friendsError}
                <button
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
            ) : friends.length === 0 ? (
            <div style={{ color: "#999", textAlign: "center", marginTop: "20px" , marginBottom: "20px" }}>暂无好友，那很可怜了</div>
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {friends.map((friend, idx) => (
                <div
                    key={friend.id ?? String(idx)}
                    onClick={() => handleStartChat(friend.id ?? friend.user_id)}
                    style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "18px 12px",
                    borderRadius: "8px",
                    backgroundColor: "#f5f5f5",
                    cursor: "pointer",
                    transition: "background 0.2s",
                    position: "relative",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#e6f7ff"; startHoverTimer(idx); }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#f5f5f5"; clearHoverTimerAndHide(idx); }}
                >
                    {(() => {
                        const avatar = (friend as any).avatar_url;
                        const idKey = String(friend.id ?? friend.user_id ?? idx);
                        const loadError = Boolean(avatarLoadErrorMap[idKey]);

                        if (avatar && !loadError) {
                            return (
                                <img
                                    src={avatar}
                                    alt={friend.nickname || friend.username}
                                    style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
                                    onError={() => setAvatarLoadErrorMap((prev) => ({ ...prev, [idKey]: true }))}
                                />
                            );
                        }

                        return (
                            <div
                                style={{
                                    width: 40,
                                    height: 40,
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
                        );
                    })()}
                    <div style={{ flex: 1, fontSize: "16px", fontWeight: 500 }}>{friend.nickname}</div>
                    <div style={{ fontSize: "14px", color: "#999" }}>@{friend.username}</div>

                    {hoveredIndex === idx && (
                    <div
                        onMouseEnter={() => { startHoverTimer(idx); }}
                        onMouseLeave={() => clearHoverTimerAndHide(idx)}
                        style={{
                        position: "absolute",
                        top: 5,
                        right: 5,
                        background: "white",
                        border: "1px solid #e6e6e6",
                        padding: "8px",
                        borderRadius: 8,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        zIndex: 20,
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexDirection: "column",
                        }}
                    >
                        <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onPrimaryAction) {
                            onPrimaryAction(friend);
                            } else {
                            onAddGroup(friend.id ?? friend.user_id, friend);
                            }
                        }}
                        style={{
                            padding: "6px 8px",
                            fontSize: 13,
                            borderRadius: 6,
                            border: "1px solid #1890ff",
                            background: "#1890ff",
                            color: "white",
                            cursor: "pointer",
                        }}
                        >
                        {primaryActionLabel || "添加分组"}
                        </button>
                        <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onDeleteFriend) {
                                onDeleteFriend(friend);
                            } else {
                                deleteFriend((friend as any).friendship_id);
                            }
                        }}
                        style={{
                            padding: "6px 8px",
                            fontSize: 13,
                            borderRadius: 6,
                            border: "1px solid #c4341aff",
                            background: "#c4341aff",
                            color: "white",
                            cursor: "pointer",
                        }}
                        >
                        删除好友
                        </button>
                    </div>
                    )}
                </div>
                ))}
            </div>
            )}
        </div>
        </div>
    );
};

export default FriendList;
