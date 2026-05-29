import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../redux/store";
import { request } from "../../utils/network";
import { BACKEND_URL } from "../../constants/string";
import { translateError } from "../../utils/errorHandler"
interface Conversation {
    conversation_id: number;
    conversation_name: string;
    type: string;
    avatar_url?: string;
    last_message?: string;
    last_message_time?: string;
    unread_count?:number;
    do_not_disturb?: boolean;
    is_pinned?: boolean;
    is_hidden?:boolean;
}

interface Props {
    onChatSelected: (chatId: string) => void;
    activeChatId?: string; // 当前选中的聊天ID，用于高亮显示
}

const ConversationList: React.FC<Props> = ({ onChatSelected, activeChatId }) => {
    const token = useSelector((s: RootState) => s.auth.token);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchConversations = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await request(`${BACKEND_URL}/api/conversations/list`, "GET", true);
            console.log("会话列表", res)
			setConversations(res || []);
        } catch (err) {
            console.error("获取会话列表失败", err);
        } finally {
            setLoading(false);
        }
    };// 获取会话列表

    const wsRef = useRef<WebSocket | undefined>(undefined);// WebSocket连接的引用

    const [hoveredConvId, setHoveredConvId] = useState<number | undefined>(undefined); // 当前鼠标悬停的会话ID
    // 移除会话并清空记录
    const handleDeleteConv = async (e: React.MouseEvent, convId: number) => {
        e.stopPropagation(); // 阻止点击事件冒泡进入聊天室
        if (!window.confirm("确定要从列表中移除该会话吗？")) return;
        try {
            await request(`${BACKEND_URL}/api/conversations/${convId}`, "DELETE", true);
            setTimeout(async () => {
                await fetchConversations(); 
                
                // 如果当前选中的就是这个会话，切断选中状态
                if (activeChatId === String(convId)) {
                    onChatSelected(""); 
                }
            }, 300); // 等待300毫秒再拉取最新列表
        } catch (err) {
            alert("移除失败" + err);
        }
    };

    useEffect(() => {
        if (!token) return;
        fetchConversations();
        let ws: WebSocket;
        let reconnectTimer: NodeJS.Timeout;

        let pingInterval: NodeJS.Timeout;
        let pongTimeout: NodeJS.Timeout;

        // 建立WebSocket连接，监听服务器推送的消息更新事件
       const isSecoder = typeof window !== 'undefined' && window.location.hostname !== 'localhost';

        // 根据环境自动选择地址
        const wsUrl = isSecoder 
            ? `wss://Vox-backend-MMJE.app.spring26b.secoder.net/ws/chat?token=${token}` // 线上直连
            : `ws://localhost:8000/ws/chat?token=${token}`; // 本地直连 

        // const wsUrl = `wss://Vox-backend-MMJE.app.spring26b.secoder.net/ws/chat?token=${token}`;

        // 心跳机制函数
        const startHeartbeat = () => {
            // 每隔 30 秒发一次 ping
            pingInterval = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "ping", data: {} }));
                    
                    // 如果发了 ping 之后，5秒内没收到 pong，说明连接“假死”了！
                    pongTimeout = setTimeout(() => {
                        console.warn("⚠️ 心跳超时没有收到 pong，主动切断假死连接...");
                        ws.close(); // 主动断开，触发 onclose 走重连
                    }, 5000);
                }
            }, 30000);
        };

        const stopHeartbeat = () => {
            clearInterval(pingInterval);
            clearTimeout(pongTimeout);
        };
        
        const connectWS = () => {
            if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

            ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("WebSocket连接成功！")
                startHeartbeat(); // 连接成功后，开始心跳
            }

            ws.onmessage = (event)  => {
                try {
                    const data = JSON.parse(event.data);

                    // 收到 pong 时，证明连接非常健康，清除超时警告！
                    if (data.type === "pong") {
                        console.log("🟢 收到 pong，心跳正常");
                        clearTimeout(pongTimeout);
                        return; // pong 只是底层的保活信号，不需要往下走业务逻辑
                    }

                    console.log("【WebSocket 接收】:", data);

                    if (data.type === "new_message") {
                        const newMsg = data.data;
                        
                        window.dispatchEvent(new CustomEvent("global_new_message", {detail: newMsg}));

                        setConversations(prev => {
                            // 检查列表里有没有这个会话
                            const exists = prev.some(conv => String(conv.conversation_id) === String(newMsg.conversation_id));
                            
                            // 兜底：如果收到新消息但本地没这个会话（比如私聊的第一次发消息），直接去后端拉取最新列表
                            if (!exists) {
                                fetchConversations();
                                return prev;
                            }

                            // 更新对应的会话信息（加上了时间和未读数更新）
                            const updatedList = prev.map(conv => {
                                if (String(conv.conversation_id) === String(newMsg.conversation_id)) {
                                    return {
                                        ...conv,
                                        last_message: newMsg.content,
                                        unread_count: (conv.unread_count || 0) + 1,
                                        // 修复：把时间更新为新消息的时间，如果没有则用当前时间
                                        last_message_time: newMsg.created_at || new Date().toISOString(),
                                        is_hidden: false
                                    };
                                }
                                return conv;
                            });

                            // 核心修复：重新排序,让最新收到消息的会话“跳”到最上面
                            updatedList.sort((a, b) => {
                                // 优先级1：置顶的永远排在前面
                                if (a.is_pinned !== b.is_pinned) {
                                    return a.is_pinned ? -1 : 1;
                                }
                                // 优先级2：根据最新消息的时间倒序排列（谁最新谁在上面）
                                const timeA = new Date(a.last_message_time || 0).getTime();
                                const timeB = new Date(b.last_message_time || 0).getTime();
                                return timeB - timeA;
                            });

                            return updatedList;
                        });
                    }
                    // “新建群聊”推送也接住
                    else if (data.type === "new_conversation") {
                        console.log("🎉 收到新会话推送，正在刷新列表...");

                        if (data.data.type === "group") {
                            alert(`🎉 您已成功加入（或回到）群聊：${data.data.conversation_name || "该群聊"}`);
                        }

                        // 🌟 纯前端魔法2：发个请求强制解除隐藏，然后刷新列表，确保它一定能出来！
                        request(`${BACKEND_URL}/api/conversations/${data.data.conversation_id}/settings`, "PATCH", true, { is_hidden: false })
                            .finally(() => {
                                fetchConversations(); // 无论成功失败，都拉取最新列表
                            });

						window.dispatchEvent(new Event("local_refresh_friends"));
						window.dispatchEvent(new Event("local_refresh_groups"));
						window.dispatchEvent(new Event("local_refresh_grouped_friends"));
                        window.dispatchEvent(new CustomEvent("local_refresh_group_info", { detail: data.data }));
                        window.dispatchEvent(new Event("local_refresh_history"));
                    }
                    else if (data.type === "MEMBER_REMOVED") {
                        console.warn("⚠️ 收到被移出群聊推送:", data.data);
                        // 通知聊天室立刻上锁
                        window.dispatchEvent(new CustomEvent("global_member_removed", { detail: data.data }));
                        fetchConversations(); // 刷新列表，清理未读数等
                    }
                    else if (data.type === "group_announcement" || data.type === "role_changed") {
                        window.dispatchEvent(new CustomEvent("local_refresh_group_info", { detail: data.data }));
                    }
					else if (data.type === "member_change") {
						window.dispatchEvent(new CustomEvent("local_refresh_group_info", { detail: data.data }));
					}
                    else if (data.type === "error") {
                        console.error("❌【后端拒绝了消息】:", data.data);
						//console.log("❌ 错误详情：", data.data.message);
						//console.log("❌ panduan：", data.data.message.includes("已不是您的好友"));
						if(data?.data?.message?.includes("已不是您的好友")){
							alert("消息发送失败：对方已不是您的好友了");
						}
						else{
							// 如果 data.data 里包着具体的错误信息 (比如 data.data.message)
                        	const backendError = data.data.message || data.data.detail || data.data;
                        
                        	// 放入翻译机
                        	alert(translateError(backendError, "消息发送失败，请重新编辑后再试"));
						}
						window.dispatchEvent(new Event("local_refresh_conversations"));
						window.dispatchEvent(new Event("local_refresh_history")); // 刷新聊天记录，防止消息发出去了但列表信息没更新的情况
                    } 
                    // 捕捉后端的成功确认信号
                    else if (data.type === "message_sent") {
                        // 派发一个全局事件，把真假ID的对照表发给 ChatRoom
                        window.dispatchEvent(new CustomEvent("global_message_ack", { detail: data.data }));
                    }
                } catch(e){
                    console.error("处理WebSocket消息失败", e);
                }
            };

            // 检测门后，自动重新敲门
            ws.onclose = (e) => {
                stopHeartbeat(); // 断开时停止发心跳
                console.warn(`WebSocket断开(代码: ${e.code})，1秒后尝试重连...`);
                reconnectTimer = setTimeout(connectWS, 1000);
            };

            ws.onerror = (e) => {
                console.error("WebSocket发生网络错误", e);
                ws.close();
            };
        };

        connectWS();

        const handleSendRequest = (e: Event) => {
            const customEvent = e as CustomEvent;
            // 收到 ChatRoom 的纸条，用自己的 ws 发给后端
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                // console.log("【WebSocket 发送】:", customEvent.detail);
                wsRef.current.send(JSON.stringify(customEvent.detail));
            } else {
                console.error("WebSocket未连接/重连中，消息发送失败，");
            }
        };
        window.addEventListener("global_send_request", handleSendRequest);

        const handleLocalSend = () => {
            setTimeout(() => {
                fetchConversations(); // 本地发送消息后也刷新会话列表，更新最后消息和未读数
            }, 100); // 延迟100ms，等后端处理完消息
        }
        window.addEventListener("local_message_sent", handleLocalSend);

        // 页面唤醒侦测 (Visibility API)
        // 当用户把网页切到后台很久，再切回来的一瞬间触发
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                    console.log("检测到页面唤醒，且连接已死，立刻零延迟重连");
                    clearTimeout(reconnectTimer);
                    connectWS(); 
                } else if (ws.readyState === WebSocket.OPEN) {
                    // 如果看着还连着，立刻发个 ping 测试一下是不是“假死”
                    ws.send(JSON.stringify({ type: "ping", data: {} }));
                }
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        // 组件卸载时清理WebSocket连接和事件监听
        return () => {
            stopHeartbeat();
            clearTimeout(reconnectTimer); // 清理定时器
            if (ws) {
                ws.onclose = () => {};
                ws.close();
            }
            window.removeEventListener("local_message_sent", handleLocalSend);
            window.removeEventListener("global_send_request", handleSendRequest);
            window.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [token]);

    useEffect(() => {
        const handleReadReceiptSent = (e: Event) => {
            const customEvent = e as CustomEvent;
            const targetChatId = customEvent.detail.conversation_id;
            setConversations(prev => prev.map(conv => {
                if (String(conv.conversation_id) === String(targetChatId)) {
                    return { ...conv, unread_count: 0};
                }
                return conv;
            }));
        };

        window.addEventListener("local_read_receipt_sent", handleReadReceiptSent);
        return () => {
            window.removeEventListener("local_read_receipt_sent", handleReadReceiptSent);
        };
    }, []);

    useEffect(() => {
        const handleRefresh = () => {
            console.log("🔄 收到全局刷新通知，正在更新会话列表...");
            fetchConversations(); 
        };

        window.addEventListener("local_refresh_conversations", handleRefresh);
        return () => {
            window.removeEventListener("local_refresh_conversations", handleRefresh);
        };
    }, []);

    useEffect(() => {
        if (activeChatId) {
            setConversations(prev => {
                let changed = false;
                const next = prev.map(conv => {
                    // 如果发现当前正在看的聊天未读数居然大于0，强制改回0
                    if (String(conv.conversation_id) === String(activeChatId) && (conv.unread_count ?? 0) > 0) {
                        changed = true;
                        return { ...conv, unread_count: 0 };
                    }
                    return conv;
                });
                // 只有真的发生修正了，才更新 state，防止死循环
                return changed ? next : prev;
            });
        }
    }, [conversations, activeChatId]);

    const formatTime = (timeInput?: string) => {
        if (!timeInput) return "";
        let date: Date;
        
        // 强力清洗脏数据
        let safeString = timeInput.replace(" ", "T");
        date = new Date(safeString);
        if (isNaN(date.getTime())) {
            safeString = timeInput.replace(/-/g, '/').replace("T", " ");
            safeString = safeString.split('.')[0]; 
            date = new Date(safeString);
        }
        if (isNaN(date.getTime())) return "";

        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();

        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (isToday) return timeStr;
        if (isYesterday) return `昨天`;
        return `${date.getMonth() + 1}-${date.getDate()}`;
    };

    if (loading && conversations.length === 0) {
        return <div style={{ padding: "20px", color: "#999", textAlign: "center" }}>加载中...</div>;
    }

    const visibleConversations = conversations.filter(conv => conv.is_hidden !== true);
    
    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "4px" }}>
            {visibleConversations.length === 0 ? (
                <div style={{ textAlign: "center", color: "#999", marginTop: 30 }}>暂无聊天记录</div>
            ) : (
                <div key={conversations.length} style={{ display: "flex", flexDirection: "column" }}>
                    {visibleConversations.map(conv => {
                        const isActive = activeChatId === String(conv.conversation_id);

                        return (
                            <div
                                key={conv.conversation_id}
                                onClick={() => onChatSelected(String(conv.conversation_id))}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    padding: "12px",
                                    borderRadius: "8px",
                                    backgroundColor: isActive ? "#e6f7ff" : (conv.is_pinned ? "#f5f5f5" : "transparent"),
                                    cursor: "pointer",
                                    transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => { 
                                    if (!isActive) e.currentTarget.style.backgroundColor = conv.is_pinned ? "#ebebeb" : "#f5f5f5"; 
                                    setHoveredConvId(conv.conversation_id);
                                }}
                                onMouseLeave={(e) => { 
                                    if (!isActive) e.currentTarget.style.backgroundColor = conv.is_pinned ? "#f5f5f5" : "transparent"; 
                                    setHoveredConvId(undefined);
                                }}
                            >
                                {/* 头像 */}
                                { conv.avatar_url ? (
                                    // 如果有头像URL，显示头像图片
                                    <img
                                    src={conv.avatar_url.startsWith('/api/') ? conv.avatar_url : `/api${conv.avatar_url}`}
                                    alt={conv.conversation_name}
                                    style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
                                />
                                ) : (
                                    // 没有头像URL，显示默认头像（群聊和私聊不同颜色，并显示最后两个字母）
                                    <div style={{
                                        width: 46, height: 46, borderRadius: "8px",
                                        backgroundColor: conv.type === "group" ? "#52c41a" : "#1890ff",
                                        display: "flex", alignItems: "center", justifyContent: "center", 
                                        color: "white", fontWeight: "bold", fontSize: "16px", flexShrink: 0,
                                    }}>
                                        {conv.conversation_name ? conv.conversation_name.slice(-2).toUpperCase() : "?"}
                                    </div>
                                )
                                }                                
                                {/* 消息信息 */}
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 600, fontSize: "15px", color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {conv.conversation_name}
                                        </div>
                                        <div style={{ fontSize: "12px", color: "#b2b2b2", flexShrink: 0, display: "flex", alignItems: "center", gap: "4px" }}>
                                            {conv.is_pinned && <span style={{ color: '#bfbfbf', fontSize: '12px' }}>📌</span>}
                                            {formatTime(conv.last_message_time)}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                        <div style={{ fontSize: "13px", color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: '10px' }}>
                                            {conv.last_message || "暂无消息"}
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>

                                            {/* 渲染静音图标和小红点 */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {/* 如果开启了免打扰，显示一个小铃铛划掉的图标 */}
                                                {conv.do_not_disturb && (
                                                    <span style={{ color: '#ccc', fontSize: '12px' }}>🔕</span>
                                                )}
                                                
                                                {/* 渲染未读数字 */}
                                                {!isActive && (conv.unread_count ?? 0) > 0 && (
                                                    <div style={{
                                                        backgroundColor: conv.do_not_disturb ? "#b0b0b0" : "#ff4d4f",
                                                        color: "white", fontSize: "12px", fontWeight: "bold",
                                                        borderRadius: "10px", padding: "0 6px", height: "18px",
                                                        lineHeight: "18px", textAlign: "center", flexShrink: 0,
                                                    }}>
                                                        {conv.unread_count! > 99 ? "99+" : conv.unread_count}
                                                    </div>
                                                )}
                                                {hoveredConvId === conv.conversation_id && (
                                                    <button
                                                        onClick={(e) => handleDeleteConv(e, conv.conversation_id)}
                                                        style={{
                                                            background: 'none', border: 'none', color: '#ccc', fontSize: '18px',
                                                            cursor: 'pointer', padding: '0 4px', lineHeight: '18px'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.color = '#ff4d4f'}
                                                        onMouseLeave={(e) => e.currentTarget.style.color = '#ccc'}
                                                        title="移除会话"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ConversationList;