import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { FriendItem } from "../utils/types";
import { RootState } from "../redux/store";
import { useSelector, useDispatch } from "react-redux";
import { resetAuth, setName, setToken } from "../redux/auth";
import GroupModal from "../components/GroupModal";
import List from "../components/List";
import GroupedFriendList from "../components/friendlist/GroupedFriendList";
import localforage from "localforage";
import ChatRoom from "../components/chat/ChatRoom";
import ConversationList from "../components/chat/ConversationList";
import GroupChatModal from "../components/chat/GroupChatModal";
import { request } from "../utils/network"
import { BACKEND_URL } from "../constants/string"

const NavAndLists: React.FC<{ 
    onAddGroup: (friendId?: number | string, friend?: FriendItem) => void; 
    refreshSignal: number;
    onChatSelected: (chatId: string) => void;
    activeChatId?: string;
    mode: 'chats' | 'all' | 'grouped';
    setMode: (mode: 'chats' | 'all' | 'grouped') => void;
}> = ({ onAddGroup, refreshSignal, onChatSelected, activeChatId, mode, setMode }) => {
    

    return (
        // make this container fill available vertical space so inner FriendList can flex and scroll
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ 
                    display: 'flex', gap: 4, marginBottom: 16,
                    backgroundColor: "#f5f5f5", padding: "4px", borderRadius: "8px"
                }}>
                    <button
                        onClick={() => setMode('chats')}
                        style={{ flex: 1, padding: '6px 0', borderRadius: '6px', border: 'none', background: mode === 'chats' ? '#fff' : 'transparent', boxShadow: mode === 'chats' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', fontWeight: mode === 'chats' ? 600 : 400, color: mode === 'chats' ? '#1890ff' : '#666', transition: 'all 0.2s' }}
                    >💬 消息</button>
                    <button
                        onClick={() => setMode('all')}
                        style={{ padding: '6px 10px', borderRadius: 6, border: mode === 'all' ? '1px solid #1890ff' : '1px solid #eee', background: mode === 'all' ? '#e6f7ff' : 'transparent', cursor: 'pointer' }}
                    >👤 列表</button>
                    <button
                        onClick={() => setMode('grouped')}
                        style={{ padding: '6px 10px', borderRadius: 6, border: mode === 'grouped' ? '1px solid #1890ff' : '1px solid #eee', background: mode === 'grouped' ? '#e6f7ff' : 'transparent', cursor: 'pointer' }}
                    >📁 分组</button>
                </div>
                {/* 内容渲染 */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
                
                {/* 消息列表 */}
                <div style={{ display: mode === 'chats' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'auto' }}>
                    <ConversationList onChatSelected={onChatSelected} activeChatId={activeChatId} />
                </div>

                {/* 好友列表 (同学写的) */}
                <div style={{ display: mode === 'all' ? 'flex' : 'none', flexDirection: 'column', flex: 1 , overflow: 'auto' }}>
                    <List onAddGroup={onAddGroup} onChatSelected={onChatSelected} />
                </div>

                {/* 分组好友 (同学写的) */}
                <div style={{ display: mode === 'grouped' ? 'flex' : 'none', flexDirection: 'column', flex: 1 , overflow: 'auto' }}>
                    <GroupedFriendList onAddGroup={onAddGroup} refreshSignal={refreshSignal} onChatSelected={onChatSelected} />
                </div>
            </div>
        </div>
    );
};

const ChatPage = () => {
    const router = useRouter();
    const dispatch = useDispatch();
    // 从redux中获取token和用户名，判断用户是否已经登录
    const token = useSelector((state: RootState) => state.auth.token);
    const userName = useSelector((state: RootState) => state.auth.username);
    const nickName = useSelector((state: RootState) => state.auth.nickname);
    const avatarUrl = useSelector((state: RootState) => state.auth.avatar_url);
    const [avatarLoadError, setAvatarLoadError] = useState(false);
    const shouldShowAvatar = Boolean(avatarUrl) && !avatarLoadError;

     // 分组 modal 控制
    const [groupModalOpen, setGroupModalOpen] = useState(false);
    const [modalFriend, setModalFriend] = useState<FriendItem | undefined>(undefined);
    const [groupRefreshSignal, setGroupRefreshSignal] = useState(0);

    const [activeChatId, setActiveChatId] = useState<string | undefined>(undefined);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false); // 控制设置面板
    const [mode, setMode] = useState<'chats' | 'all' | 'grouped'>('chats');
    const [groupChatOpen, setGroupChatOpen] = useState(false);

    //关于防止刷新掉线
    useEffect(() => {
        const restoreAuth = async () => {
            const storedToken = await localforage.getItem<string>("token");
            const storedUsername = await localforage.getItem<string>("username");
            if (!token && storedToken && storedUsername) {
                dispatch(setToken(storedToken));
                dispatch(setName(storedUsername));
            }
        };
        restoreAuth();
    }, [dispatch, token]);

    useEffect(() => {
        const restoreView = async () => {
            // 恢复上次打开的 Tab 模式
            const savedMode = await localforage.getItem<'chats' | 'all' | 'grouped'>("lastTabMode");
            if (savedMode) {
                setMode(savedMode);
            } else {
                setMode('all'); // 如果没存过，默认显示“好友”，这样最保险
            }

            // 恢复上次的聊天 ID
            const savedChatId = await localforage.getItem<string>("lastActiveChatId");
            if (savedChatId) {
                try {
                    // 去后端查一下，当前账号到底有没有这个群
                    const res = await request(`${BACKEND_URL}/api/conversations/list`, "GET", true);
                    // const exists = res.some((c: any) => String(c.conversation_id) === String(savedChatId));
                    const exists = res.some((c: any) => String(c.conversation_id) === String(savedChatId) && c.is_hidden !== true);
                    if (exists) {
                        setActiveChatId(savedChatId);
                    } else {
                        // 没权限，立刻抹除本地痕迹
                        await localforage.removeItem("lastActiveChatId");
                        setActiveChatId(undefined);
                    }
                } catch (err) {
                    console.error("验证历史会话失败:", err);
                    await localforage.removeItem("lastActiveChatId");
                    setActiveChatId(undefined);
                }
            }
        };
        
        // 当 token 恢复成功后再读取业务缓存，确保数据请求能发出去
        if (token) {
            restoreView();
        }
    }, [token]); // 依赖 token 的恢复

    // 保存 mode 到本地，防止刷新丢 Tab 状态
    useEffect(() => {
        localforage.setItem("lastTabMode", mode);
    }, [mode]);

    useEffect(() => {
        setAvatarLoadError(false);
    }, [avatarUrl]);

    const handleLogout = async () => {
        dispatch(resetAuth());
        await localforage.clear();
        alert("退出登录成功");
    }

    const handleDeleteAccount = async () => {
        if (!token) {
            alert("当前未登录，无需注销");
            return;
        }
        try {
            const res = await fetch("/api/auth/delete_account", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.status === 204) {
                // 成功（No Content）
                dispatch(resetAuth());
                await localforage.clear();
                alert("注销账户成功!");
                return;
            }

            if (res.status === 401) {
                // 未认证，尝试读取返回的 JSON 错误体
                let body: any;
                try {
                    body = await res.json();
                } catch {
                    //ignore
                }
                const detail = body?.detail ?? "Not authenticated";
                alert(`注销失败: ${detail}`);
                return;
            }

            // 其他非预期状态
            let text = "";
            try {
                text = await res.text();
            } catch {
                // ignore
            }
            alert(`注销失败: ${res.status} ${res.statusText} ${text}`);
        } catch (err: any) {
            console.error("delete_account error:", err);
            if (err && err.message) {
                alert(`网络错误: ${err.message}`);
            } else {
                alert("发生未知错误，注销失败");
            }
        }
    }

    


    // Accept friend object when available (FriendList passes it); otherwise fall back to id
    const addGroup = (friendId?: number | string, friend?: FriendItem) => {
        if (friend) {
            const normalized = { ...(friend as any), id: (friend as any).id ?? (friend as any).user_id } as FriendItem;
            setModalFriend(normalized);
    } else if (typeof friendId !== "undefined") {
            
            const fid = Number(friendId);
            setModalFriend({ user_id: fid, id: fid, username: String(fid), nickname: String(fid) } as unknown as FriendItem);
        } else {
            setModalFriend(undefined);
        }
        setGroupModalOpen(true);
    };

    //选中聊天后，强制把左侧切回“消息”Tab
    const handleChatSelected = (chatId: string) => {
        setActiveChatId(chatId);
        setMode('chats'); 
    };

    useEffect( () => {
        if (activeChatId) {
            localforage.setItem("lastActiveChatId", activeChatId);
        }
    }, [activeChatId]);

    // 如果未登录，重定向回首页
    useEffect(() => {
        if (!token) {
            router.push("/");
        }
    }, [token, router]);

    if (!token) {
        return undefined; // 或者加载 spinner
    }

    return (
        <div style={{ height: "100vh", fontFamily: "sans-serif", display: "flex" }}>
            {/* 左侧栏 */}
            <aside style={{ 
                width: "320px", 
                minWidth: "240px", 
                borderRight: "1px solid #e6e6e6", 
                display: "flex", 
                flexDirection: "column", 
                padding: "24px 16px", 
                boxSizing: "border-box", 
                minHeight: 0, 
                overflow: "hidden",
                backgroundColor: "#fff"
            }}>
                {/* 增加标题固定位置 */}
                <div style = {{ marginBottom: "16px", paddingLeft: "4px", display: "flex", gap: "12px", width: "100%",whiteSpace: "nowrap" }}>
                    <h2 style={{margin: 0, fontSize: "16px", fontWeight: 700, textAlign: "left", flex: 8, display: "flex", justifyContent: "flex-start", alignItems: "center", gap: "6px" }}>
						<span style={{
							display: "inline-block",
							background: "linear-gradient(90deg, #9381ff, #f865b0, #ff9770, #70d6ff, #9381ff)",
							backgroundSize: "400% 100%",
							backgroundClip: "text",
							WebkitBackgroundClip: "text",
							color: "transparent",
							fontSize: "35px",
							fontWeight: 1200,
							lineHeight: 1,
						}}>
							VOX
						</span>
					</h2>
                    <button 
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#feb240cc"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#feb240ff"}
                        onClick={() => setGroupChatOpen(true)}
                        style = {{
                            flex: 2,
                            padding: "5px 6px",
                            backgroundColor: "#feb240ff",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "15px",
                            fontWeight: "600",
                        }}>
                        🗪 发起群聊
                    </button>
                        
                </div>

                {/* 查找/添加好友按钮 */}
                <div style={{ marginBottom: "12px" }}>
                    <button
                        onClick={() => router.push("/friends/FriendSearch")}
                        onMouseEnter={(e)=> e.currentTarget.style.backgroundColor = "#0f8afccc"}
                        onMouseLeave={(e)=> e.currentTarget.style.backgroundColor = "#1890ff"}
                        style={{
                            width: "100%",
                            padding: "10px 14px",
                            backgroundColor: "#1890ff",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "15px",
                            fontWeight: "600",
                        }}
                    >
                        🔍 查找 / 添加好友
                    </button>
                </div>

                {/* 顶部：Chats / All / Grouped 切换导航 */}
                <NavAndLists 
                    onAddGroup={addGroup} 
                    refreshSignal={groupRefreshSignal} 
                    onChatSelected={handleChatSelected} 
                    activeChatId={activeChatId}
                    mode={mode}
                    setMode={setMode}
                />

                {/* 底部：可点击的圆角矩形块，显示用户名和昵称，点击跳转到 profile */}

                {/* 左下角设置与个人信息区域 */}
                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "12px", position: "relative" }}>
                    {/* 设置浮层 (Pop-up) */}
                    {isSettingsOpen && (
                        <div style={{ position: "absolute", bottom: "70px", left: "0", width: "100%", background: "#fff", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "10px", zIndex: 100, border: "1px solid #eee" }}>
                            <button onClick={handleLogout} style={{ width: "100%", padding: "10px", marginBottom: "8px", background: "#ff4d4f", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}>退出登录</button>
                            <button onClick={handleDeleteAccount} style={{ width: "100%", padding: "10px", background: "#444", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}>注销账号</button>
                        </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {/* 个人主页入口 */}
                        <div onClick={() => router.push("/auth/ProfilePage")} style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                             {shouldShowAvatar ? (
                                <img
                                    src={avatarUrl}
                                    alt="avatar"
                                    style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }}
                                    onError={() => setAvatarLoadError(true)}
                                />
                            ) : (
                                <div style={{ width: 48, height: 48, borderRadius: "50%", backgroundColor: "#fcbc32ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontWeight: 700 }}>
                                {userName ? userName.charAt(0).toUpperCase() : "?"}
                                </div>
                            )}
                            <div style={{ flex: 1 , marginLeft: "3px"}}>
                            <div style={{ fontSize: "12px", color: "#999" }}>{"@" + (userName || "?")}</div>
                            <div style={{ fontSize: "16px", fontWeight: 700 }}>{nickName}</div>
                        </div>
                        </div>

                        {/* 设置按钮 */}
                        <button 
                        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                        style={{ 
                            background: "#f5f5f5", 
                            border: "none", 
                            borderRadius: "4px", 
                            padding: "4px 8px", 
                            color: "#666", 
                            fontSize: "15px", 
                            cursor: "pointer",
                            transition: "background 0.2s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#e8e8e8"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#f5f5f5"}
                        >
                        设置
                    </button>
                    </div>
                </div>
            </aside>

            {/* 右侧主区域 */}
            <main style={{ flex: 1, padding: "20px", boxSizing: "border-box", display: "flex" }}>
                {mode === 'chats' ? (
                    // 只有在“消息”Tab下，才尝试渲染聊天框
                    activeChatId ? (
                        <ChatRoom 
                            chatId={activeChatId} 
                            onChatInvalid={() => {
                                alert("该会话已失效（对方可能已注销）");
                                setActiveChatId(undefined);
                                localforage.removeItem("lastActiveChatId");
                            }}
                        />     
                    ) : (
                        <div style={{ margin: "auto", textAlign: "center", color: "#bbb" }}>
                            <div style={{ fontSize: "64px", marginBottom: "16px", opacity: 0.5 }}>💬</div>
                            <h2>Vox Chat</h2>
                            <p>未选中会话，请在左侧选择好友开始聊天</p>
                        </div>
                    )
                ) : (
                    // 如果在“好友”或“分组”Tab下，强制显示通讯录管理的背景
                    <div style={{ margin: "auto", textAlign: "center", color: "#bbb" }}>
                        <div style={{ fontSize: "64px", marginBottom: "16px", opacity: 0.5 }}>👥</div>
                        <h2>通讯录管理</h2>
                        <p>您可以在左侧进行添加好友、分组管理等操作</p>
                    </div>
                )}
            </main>

            {/* 好友分组弹窗 */}
            <GroupModal
                open={groupModalOpen}
                friend={modalFriend}
                onGroupChanged={() => setGroupRefreshSignal((v) => v + 1)}
                onClose={() => { setGroupModalOpen(false); setModalFriend(undefined); }}
            />
            {/* 发起群聊弹窗 */}
            <GroupChatModal
                open={groupChatOpen}
                onClose={() => setGroupChatOpen(false)}
                onCreated={(conversationId) => {
                    setActiveChatId(conversationId);
                    setMode('chats');
                }}
            />
        </div>
    );
};

export default ChatPage;