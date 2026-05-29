import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from "react";
// import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { RootState } from "../../redux/store";

import { MessageItem } from "../../components/chat/MessageItem";
import { ChatInput } from "../../components/chat/ChatInput";
import GroupInviteModal from "../../components/chat/GroupInviteModal";
import GroupInviteReviewModal from "../../components/chat/GroupInviteReviewModal";

import { request } from "../../utils/network";
import { BACKEND_URL } from "../../constants/string";
import { translateError } from "../../utils/errorHandler"
import { ChatSidebar } from "./ChatSidebar"; // 确保路径对应

// ========== 全局主题色（匹配 AuthShell） ==========
const theme = {
  // 主色（AuthShell 核心紫色）
  primary: '#9381ff',
  // 主色浅变体（hover/背景）
  primaryLight: '#e8e4ff',
  // 主色深变体（active）
  primaryDark: '#7a67ee',
  // 辅助色（AuthShell 粉色）
  secondary: '#f865b0',
  // 文字色系统
  textPrimary: '#2d2b55', // 主文字（深紫灰）
  textSecondary: '#7b7b99', // 次要文字（浅紫灰）
  textTertiary: '#a0a0c0', // 辅助文字
  // 边框/分割线
  border: '#f0efff',
  // 背景色
  bgLight: '#faf9ff',
  // 阴影色
  shadow: 'rgba(147, 129, 255, 0.15)',
  shadowHover: 'rgba(147, 129, 255, 0.25)',
  // 危险色
  danger: '#ff6b81',
  dangerLight: '#fff1f3',
  // 警告色
  warning: '#ff9770',
  warningLight: '#fff7e8',
  // 统一圆角
  borderRadius: '18px',
  cardRadius: '22px',
  // 统一过渡
  transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
};

const getValidAvatarUrl = (url?: string) => {
    // 1. 过滤所有脏数据：空值、纯空格、字符串 "null"
    if (!url || url.trim() === "" || url === "null") return undefined; 
    
    // 2. 正常的路径拼接逻辑
    const trimmed = url.trim();
    if (trimmed.startsWith('http')) return trimmed;
    const pathWithSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    if (pathWithSlash.startsWith('/api/')) return pathWithSlash;
    return `/api${pathWithSlash}`; 
};

interface ChatRoomProps {
    chatId: string;
    onChatInvalid?: () => void; // 可选的回调函数，当聊天无效时调用（例如好友注销了）
}

interface ConversationSettings {
    do_not_disturb: boolean;
    is_pinned: boolean;
}

import type { GroupInfo } from "../../components/group/GroupAnnouncementSection";

interface Message {
    msgId: number;
    senderId: number;
    msgBody: string;
    createTime: string;
    avatarUrl: string;
    senderName: string; 
    replyTo?: number;
    showReply?: boolean;
    replyContent?: string;
    replySenderName?: string;
    replySendTime?: string;
    replyNum?: number;
}

const ChatRoom: React.FC<ChatRoomProps>  = ({ chatId}) => {
    const currentUserId = useSelector((state: RootState) => state.auth.user_id);
    const token = useSelector((state: RootState) => state.auth.token); // 获取token以便后续请求使用
    const myNickname = useSelector((state: RootState) => state.auth.nickname || state.auth.username); // 获取昵称，优先使用nickname，没有则使用username
    const currentUserAvatar = useSelector((state: RootState) => state.auth.avatar_url ); // 获取当前用户头像URL，后续发送消息时使用

    // 状态管理
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatTitle, setChatTitle] = useState<string>(`加载中...`); // 聊天标题，后续可以根据chatId请求获取实际标题
    const [replyPreview, setReplyPreview] = useState<{ content: string; senderName?: string; sendTime?: string; msgId?: number } | undefined>(undefined);
    const [highlightMsgId, setHighlightMsgId] = useState<number | undefined>(undefined);
    const messagesEndRef = useRef<HTMLDivElement>(undefined as unknown as HTMLDivElement);
    const messageRefs = useRef<Record<string, HTMLDivElement | undefined>>({});
    // 用来记录是不是刚点进来的“第一次加载”
    const isFirstLoad = useRef(true);
    // 用来在执行删除等操作时抑制自动滚动
    const suppressAutoScrollRef = useRef(false);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false); // 控制侧边栏显隐
    const [settings, setSettings] = useState<ConversationSettings>({ do_not_disturb: false, is_pinned: false });
    const [groupInfo, setGroupInfo] = useState<GroupInfo | undefined>(undefined);
    const [isGroupInfoLoading, setIsGroupInfoLoading] = useState(false);
    const [groupInfoRefreshNonce, setGroupInfoRefreshNonce] = useState(0);

    const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
    const [filterStartTime, setFilterStartTime] = useState("");
    const [filterEndTime, setFilterEndTime] = useState("");
    const [filterSenderId, setFilterSenderId] = useState(""); // 🌟 新增：用于存放选中的群成员ID

    const [isFiltering, setIsFiltering] = useState(false); // 是否处于筛选展示模式
    const isFilteringRef = useRef(false); // 用于在 WebSocket 中拦截实时消息
    const scrollContainerRef = useRef<HTMLDivElement>(undefined as unknown as HTMLDivElement);
    const [openMenuId, setOpenMenuId] = useState<number | undefined>(undefined);
    const [isKicked, setIsKicked] = useState(false);
    const pollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
    // const [isTitleLocked, setIsTitleLocked] = useState(false);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const isGroupInactive = isKicked;
    const [isGroupChat, setIsGroupChat] = useState(false);
    const previousScrollHeightRef = useRef<number>(0);
    const justSentRef = useRef(false);
    // 记录用户是否在底部（接近底部 100px 范围内）
    const isNearBottomRef = useRef(true);

    const isReadOnly = useMemo(() => {
        // 只有在私聊（不是群聊）时，才检查对方是否注销
		if (!isGroupChat && chatTitle === "已注销用户") {
			return true;
		}
		// 群聊的锁定逻辑交给 isKicked 处理
		return false;
	}, [isGroupChat, chatTitle]);

    // 1. 获取当前用户在群里的角色
    const myRole = useMemo(() => {
        return groupInfo?.members?.find(m => String(m.user_id) === String(currentUserId))?.role;
    }, [groupInfo, currentUserId]);

    // 是否为群主（owner）
    const isOwner = useMemo(() => myRole === 'owner', [myRole]);
    const canReviewInvites = useMemo(() => myRole === 'owner' || myRole === 'admin', [myRole]);

    const isLeftGroup = useMemo(() => myRole === "kicked" || myRole === "quit"|| (groupInfo !== undefined && !myRole), [myRole, groupInfo]);
    const isUserOut = useMemo(() => {
        return isKicked || isLeftGroup;
    }, [isKicked, isLeftGroup]);
    useEffect(() => {
        if (isUserOut) {
            setIsSidebarOpen(false);
        }
    }, [isUserOut]);
    useEffect(() => {
        const handleMemberRemoved = (e: Event) => {
            const ev = e as CustomEvent;
            // 如果踢的就是当前正在看的群，立刻上锁
            if (String(ev.detail.conversation_id) === String(chatId)) {
                setIsKicked(true);
            }
        };
        window.addEventListener("global_member_removed", handleMemberRemoved);
        return () => window.removeEventListener("global_member_removed", handleMemberRemoved);
    }, [chatId]);


    // 2. 权限判断工具
    const getPermissions = (targetRole: string, targetUserId: number) => {
        const isSelf = String(targetUserId) === String(currentUserId);
        if (isSelf || !myRole || (myRole !== 'owner' && myRole !== 'admin')) 
            return { remove: false, setAdmin: false, cancelAdmin: false, transfer: false };

        return {
            remove: (myRole === 'owner' && targetRole !== 'owner') || (myRole === 'admin' && targetRole === 'member'),
            setAdmin: myRole === 'owner' && targetRole === 'member',
            cancelAdmin: myRole === 'owner' && targetRole === 'admin',
            transfer: myRole === 'owner' && targetRole !== 'owner'
        };
    };

    // 3. 执行管理动作的函数
    const handleMemberAction = async (targetId: number, action: 'remove' | 'set_admin' | 'cancel_admin' | 'transfer') => {
        try {
            if (action === 'remove' && !confirm("确定要移除该成员吗？")) return;
            if (action === 'transfer' && !confirm("确定要转让群主吗？转让后你将失去群主权限！")) return;

            // 将 api/groups 改为 api/conversations，与 fetchGroupInfo 保持一致
            const baseUrl = `${BACKEND_URL}/api/conversations/${chatId}/members/${targetId}`;
            
            if (action === 'remove') {
                await request(baseUrl, "DELETE", true);
                if (String(targetId) === String(currentUserId)) {
                    setIsKicked(true);
                    setIsSidebarOpen(false);
                }
				fetchHistory();
            } else {
                const role = action === 'set_admin' ? 'admin' : (action === 'cancel_admin' ? 'member' : 'owner');
                // 注意：后端定义 PATCH 路由为 .../members/{target_user_id}/role
                await request(`${baseUrl}/role`, "PATCH", true, { role });
            }
            
            // 操作成功后立即刷新
            fetchGroupInfo(); 
        } catch (err: any) {
            console.error("操作失败:", err);
            alert(translateError(err, "操作失败，请检查权限"));
        }
    };

    // 获取当前会话设置 (当打开侧边栏时触发)
    const fetchSettings = async () => {
        try {
            const res = await request(`${BACKEND_URL}/api/conversations/list`, "GET", true);
            const current = res.find((c: any) => String(c.conversation_id) === String(chatId));
            if (current) {
                setSettings({ 
                    do_not_disturb: !!current.do_not_disturb, 
                    is_pinned: !!current.is_pinned 
                });
            }
        } catch (err) {
            console.error("获取设置失败", err);
        }
    };

    const fetchGroupInfo = useCallback(async () => {
        if (!chatId) return;
        try {
            setIsGroupInfoLoading(true);
            const res = await request(`${BACKEND_URL}/api/conversations/${chatId}/group-info`, "GET", true);
            setGroupInfo(res || undefined);
            setIsKicked(false);
			console.log("【inner】fetchgroupinfo内部:", res);
        } catch (error: any) {
            if (error?.message?.includes("不是群聊") || error?.status === 400) {
                return;
            }
            console.error("获取群聊信息失败", error);
            setGroupInfo(undefined);
        } finally {
            setIsGroupInfoLoading(false);
        }
    }, [chatId]);

    const forceRefreshGroupInfo = useCallback(() => {
        setGroupInfo(undefined);
        setGroupInfoRefreshNonce((prev) => prev + 1);
    }, []);

    useEffect(() => {
        if (groupInfoRefreshNonce > 0) {
            fetchGroupInfo();
        }
    }, [groupInfoRefreshNonce, fetchGroupInfo]);

    useEffect(() => {
        const handleRefresh = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.conversation_id && String(detail.conversation_id) !== String(chatId)) {
                return;
            }
            forceRefreshGroupInfo();
        };
        window.addEventListener("local_refresh_group_info", handleRefresh);
        return () => window.removeEventListener("local_refresh_group_info", handleRefresh);
    }, [chatId, forceRefreshGroupInfo]);

    // 轮询检测自己是否还在群聊中（仅对群聊有效）
    const checkMembershipStatus = useCallback(async () => {
        if (!chatId || isKicked|| !isGroupChat) return;
        try {
            // 尝试获取群信息，如果返回403则说明被踢
            await request(`${BACKEND_URL}/api/conversations/${chatId}/group-info`, "GET", true);
        } catch (err: any) {
            if (err.status === 403 || err?.message?.includes("403")) {
                if (!isKicked) {
                    console.log("检测到被移出群聊");
                    setIsKicked(true);
                    // setChatTitle("已移出群聊");
                    setIsSidebarOpen(false);
                    // setMessages([]);
                }
            }
        }
    }, [chatId, isKicked,isGroupChat]);

    // 启动轮询（每15秒）
    useEffect(() => {
        if (!chatId || isKicked) return;
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = setInterval(() => {
            if (document.visibilityState === 'visible') {
                checkMembershipStatus();
            }
        }, 15000);
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [chatId, isKicked, checkMembershipStatus]);

    // 页面可见时立即检查一次
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && !isKicked && chatId) {
                checkMembershipStatus();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [checkMembershipStatus, isKicked, chatId]);

    

	// 监听侧边栏打开动作，每次打开时拉取最新状态
    // 侧边栏打开时只拉取设置
    useEffect(() => {
        if (isSidebarOpen && chatId) {
            fetchSettings();
        }
    }, [isSidebarOpen, chatId]);

    // 只要切换聊天，立刻拉取成员信息！这样才能瞬间知道对方注销没有
    useEffect(() => {
        if (chatId) {
            // 我们不能无脑 fetchGroupInfo，因为它只对群聊有效
            // 我们需要先获取会话的基础信息来判断它是群聊还是私聊
            checkConversationTypeAndFetch();
        }
    }, [chatId]);

    const checkConversationTypeAndFetch = async () => {
        try {
            // 获取所有会话列表，从中找到当前 chatId 的类型
            const res = await request(`${BACKEND_URL}/api/conversations/list`, "GET", true);
            const currentConv = res.find((c: any) => String(c.conversation_id) === String(chatId));
            
            if (currentConv) {
                // 1. 唤醒逻辑
                if (currentConv.is_hidden) {
                    console.log("正在唤醒隐藏会话...");
                    // 1. 调用 PATCH 把 is_hidden 改为 false
                    await request(`${BACKEND_URL}/api/conversations/${chatId}/settings`, "PATCH", true, { is_hidden: false });
                    
                    // 2. 关键！强制触发左侧列表刷新，让它瞬间从“隐藏”变成“显示”
                    window.dispatchEvent(new CustomEvent("local_force_show_conversation", { 
                        detail: { conversation_id: chatId } 
                    }));
                }

                // 2. 严谨的状态重置逻辑
                if (currentConv.type === 'group') {
                    setIsGroupChat(true);
                    // 只有确定是群聊，才去获取群信息
                    fetchGroupInfo(); 
                } else {
                    setIsGroupChat(false);
                    setGroupInfo(undefined); // <--- 确保清空群信息
                    setIsKicked(false);      // <--- 确保清空被踢状态
                }
            }
        } catch (err) {
            console.error("获取会话类型失败", err);
        }
    };

    // 更新设置并同步给后端
    const updateSetting = async (key: keyof ConversationSettings, value: boolean) => {
        try {
            // 乐观更新本地 UI
            setSettings(prev => ({ ...prev, [key]: value }));
            
            // 发请求给后端
            await request(
                `${BACKEND_URL}/api/conversations/${chatId}/settings`,
                "PATCH",
                true,
                { [key]: value }
            );
            
            // 触发一个全局事件，通知左侧会话列表重新拉取数据以更新图标/排序
            window.dispatchEvent(new Event("local_message_sent")); 
        } catch (err) {
            alert("设置更新失败" + (err instanceof Error ? `: ${err.message}` : ""));
            // 发生错误时回滚状态 (可选)
            fetchSettings(); 
        }
    };

    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        // 1. 如果是在加载历史记录（suppressAutoScrollRef），保持视口稳定
        if (suppressAutoScrollRef.current) {
            suppressAutoScrollRef.current = false;
            container.scrollTop = container.scrollHeight - previousScrollHeightRef.current;
        } 
        // 2. 如果是自己发的，或者本来就在底部，就滚到底部
        else if (justSentRef.current || isNearBottomRef.current) {
            // 使用 scrollTo 配合 behavior: 'auto' 可以避免看到滚动动画，实现瞬间吸底
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'auto' 
            });
            
            // 重置状态
            justSentRef.current = false;
            isNearBottomRef.current = true; // 滚动后肯定是底部的
        }
    }, [messages]); // 依然依赖 messages
    // const wsRef = useRef<WebSocket | undefined>(undefined);
	const historyChatIdRef = useRef<string | undefined>(undefined);
	// DEBUG
	// const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const fetchHistory = useCallback( async (useFilters = false, isLoadMore = false) => {
        if (!chatId || !token || !currentUserId) return;
        try {
            const queryParams = new URLSearchParams();

            if (isLoadMore && messages.length > 0) {
                // messages 数组里第一条（索引0）就是当前最顶上的老消息
                queryParams.append("before_msg_id", String(messages[0].msgId));
            }

            if (useFilters) {
                if (filterStartTime) queryParams.append("start_time", `${filterStartTime}T00:00:00`);
                if (filterEndTime) queryParams.append("end_time", `${filterEndTime}T23:59:59`);
                if (filterSenderId) queryParams.append("sender_id", filterSenderId);
            }

            const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";
			//console.log("[DEBUG] Fetching history with query:", queryString);
			let res :any = [];
			try {
				//console.log('api:', `${BACKEND_URL}/api/conversations/${chatId}/messages${queryString}`);
            	res = await request(`${BACKEND_URL}/api/conversations/${chatId}/messages${queryString}`, "GET", true);
				//console.log("[inner] Raw response:", res);
			} catch (err) {
				console.error("请求历史消息失败:", err);
			}
			//console.log("[DEBUG] Received history:", res);
			//await fetchGroupInfo();
			// await sleep(5000);
			//console.log("[DEBUG1] chatid:", chatId);
			//console.log("[DEBUG2] Group info after fetching history:", groupInfo);
			//console.log("[DEBUG3] Current role:", myRole);
            
            const historyMessages: Message[] = res.map((msg: any) => ({
                msgId: msg.msg_id, senderId: msg.sender_id, msgBody: msg.content,
                createTime: msg.created_at, avatarUrl: msg.sender_avatar || "", 
                senderName: msg.sender_name || "", replyTo: msg.reply_to,
                showReply: Boolean(msg.reply_to), replyNum: msg.reply_count,
            }));

            if (isLoadMore) {
                // 注意顺序：[后端返回的更早的消息, ...当前的 50 条消息]
                setMessages(prev => [...historyMessages, ...prev]);
                // 抑制自动滚到底部，防止加载更多时突然“跳”到最下面
                suppressAutoScrollRef.current = true;
            } else {
                setMessages(historyMessages);
            }

            historyChatIdRef.current = String(chatId);

            setIsFiltering(useFilters);
            isFilteringRef.current = useFilters;
        } catch (err: any) {
            const errMsg = err.message || "";
            // 即使报错，也只上锁，绝对不去动已经加载好的 messages，也不要强行退出！
            if (err.status === 403 || errMsg.includes("403") || errMsg.includes("移出") || errMsg.includes("无权")) {
                setIsKicked(true);
                setIsSidebarOpen(false);
                // 别写 return！别写 onChatInvalid！把舞台留给历史消息！
            } else {
                console.error("加载历史记录出现错误:", err);
            }
        }
    },[chatId, token, currentUserId, messages, filterStartTime, filterEndTime, filterSenderId]);
	useEffect(() => {
		const handleRefresh = () => fetchHistory();
		window.addEventListener("local_refresh_history", handleRefresh);
		return () => window.removeEventListener("local_refresh_history", handleRefresh);
	}, [fetchHistory]);

    useEffect(() => {
        isFirstLoad.current = true;
        setIsSearchPanelOpen(false);
        setIsFiltering(false);
        isFilteringRef.current = false;
        setFilterStartTime("");
        setFilterEndTime("");
        setFilterSenderId("");
    	setGroupInfo(undefined);
        setIsKicked(false);                // 重置被踢标志
        // setIsTitleLocked(false);      // 重置锁定
        setChatTitle("");         // 重置标题
        setMessages([]);
        fetchHistory(false);
    }, [chatId, token, currentUserId]);

    useEffect(() => {
        if (isGroupInactive) {
            setIsSidebarOpen(false);
        }
    }, [isGroupInactive]);

    const applySearch = () => {
        setIsSidebarOpen(false); 
        fetchHistory(true);
    };

    const clearSearch = () => {
        setFilterStartTime("");
        setFilterEndTime("");
        setFilterSenderId("");
        setIsFiltering(false);
        isFilteringRef.current = false;
        isFirstLoad.current = true;
        fetchHistory(false); 
    };

    useEffect( () => {
        if (!token || !chatId) return;
        const handleReceive = (e: Event) => {
            if (isFilteringRef.current) return;
            const Eve = e as CustomEvent;
            const newMsg = Eve.detail;

            if (String(newMsg.conversation_id) === String(chatId)) {
                if (String(newMsg.sender_id) === String(currentUserId)) return;

                let shouldSyncHistory = false;

                setMessages(prev => {
                    const hasReplyTarget = newMsg.reply_to
                        ? prev.some(message => String(message.msgId) === String(newMsg.reply_to))
                        : false;

                    if (newMsg.reply_to && !hasReplyTarget) {
                        shouldSyncHistory = true;
                    }

                    const updated = newMsg.reply_to
                        ? prev.map(message => (
                            String(message.msgId) === String(newMsg.reply_to)
                                ? { ...message, replyNum: (message.replyNum || 0) + 1 }
                                : message
                        ))
                        : prev;
                    return [...updated, {
                        msgId: newMsg.msg_id,
                        senderId: newMsg.sender_id,
                        msgBody: newMsg.content,
                        createTime: newMsg.created_at,
                        avatarUrl: newMsg.sender_avatar,
                        senderName: newMsg.sender_name,
                        replyTo: newMsg.reply_to,
                        showReply: Boolean(newMsg.reply_to),
                        replyNum: newMsg.reply_count,
                    }];
                });

                if (shouldSyncHistory) {
                    suppressAutoScrollRef.current = true;
                    fetchHistory();
                }
            }
        };

        window.addEventListener("global_new_message", handleReceive);
        return () => window.removeEventListener("global_new_message", handleReceive);
    }, [chatId, currentUserId, token]);

    // 获取真实的会话名称
    useEffect(() => {
        if (!chatId || !token) return;
        // if (isTitleLocked) return;    // 已锁定，不再获取
        // if (isKicked) return; // 被踢后不再从后端获取标题，保留现有标题

        const fetchChatTitle = async () => {
            try {
                // 调用后端已有的会话列表接口
                const convList = await request(`${BACKEND_URL}/api/conversations/list`, "GET", true);
                
                // 在列表里找到当前这个 chatId 对应的会话
                const currentConv = convList.find((c: any) => String(c.conversation_id) === String(chatId));
                
                if (currentConv && currentConv.conversation_name) {
                    setChatTitle(currentConv.conversation_name);
                }
            } catch (err) {
                console.error("获取会话名称失败:", err);
                
            }
        };

        fetchChatTitle();
    }, [chatId, token]);

	// --------------- 顶部加一行 ----------------
	const latestChatIdRef = useRef(chatId);

	// --------------- 监听最新 chatId ----------------
	useEffect(() => {
		latestChatIdRef.current = chatId;
	}, [chatId]);
    // 发送已读回执逻辑
    useEffect(() => {
    if (isFiltering || isKicked || isUserOut) return;
    if (historyChatIdRef.current && historyChatIdRef.current !== String(chatId)) return;
    const validMessages = messages.filter(m => m.msgId < 1000000000000);
    if (validMessages.length > 0) {
        const lastMsgId = validMessages[validMessages.length - 1].msgId;

        // 通过 Websocket 发送给后端，更新数据库中的 read_msg_id
        window.dispatchEvent(new CustomEvent("global_send_request", {
            detail: {
                type: "read_receipt",
                data: {
                    conversation_id: Number(chatId),
                    last_read_msg_id: lastMsgId
                }
            }
        }));
        console.log(`📨【Debug】 conversation_id=${chatId}, last_read_msg_id=${lastMsgId}`);

        // 统治左侧将未读数清零
        window.dispatchEvent(new CustomEvent("local_read_receipt_sent", {
            detail: {
                conversation_id: Number(chatId)
            }
        }));
    }
    }, [messages, isFiltering, isKicked, isUserOut, chatId]); // 消息列表或者当前聊天室切换时触发

    // 监听后端的发送回执，将刚才自己发送的消息的“临时假ID”替换为“数据库真ID”
    useEffect(() => {
        const handleMessageAck = (e: Event) => {
            const ackData = (e as CustomEvent).detail;
            
            // 在 F12 里调试用
            console.log("👮‍♂️【前端换证中心】收到后端的真身份证:", ackData);
            
            // 确保是当前正在看的聊天室
            if (String(ackData.conversation_id) === String(chatId)) {
                
                // 替换聊天列表里的假ID
                setMessages(prev => prev.map(msg => {
                    if (String(msg.msgId) === String(ackData.temp_id)) {
                        console.log(`✅【换证成功】消息栏: ${ackData.temp_id} -> 真实ID ${ackData.msg_id}`);
                        return { ...msg, msgId: ackData.msg_id };
                    }
                    return msg;
                }));

                // Bug：如果当前输入框引用的正是这条假消息，把它也换成真ID
                setReplyPreview(prev => {
                    if (prev && String(prev.msgId) === String(ackData.temp_id)) {
                        console.log(`✅【换证成功】引用框: ${ackData.temp_id} -> 真实ID ${ackData.msg_id}`);
                        return { ...prev, msgId: ackData.msg_id };
                    }
                    return prev;
                });
            }
        };

        window.addEventListener("global_message_ack", handleMessageAck);
        return () => window.removeEventListener("global_message_ack", handleMessageAck);
    }, [chatId]);

    const handleScrollToMessage = (targetMsgId?: number) => {
        if (!targetMsgId) return;
        const target = messageRefs.current[String(targetMsgId)];
        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            setHighlightMsgId(targetMsgId);
            window.setTimeout(() => {
                setHighlightMsgId(prev => (prev === targetMsgId ? undefined : prev));
            }, 1600);
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        isNearBottomRef.current = target.scrollHeight - target.scrollTop - target.clientHeight <= 1;
        if (target.scrollTop <= 1 && messages.length >= 50 && !isFiltering) {
            // 在去后端拿数据前，死死记住当前的高度
            previousScrollHeightRef.current = target.scrollHeight;
            
            //去掉 .then()，DOM 高度的补偿交给 useLayoutEffect
            fetchHistory(false, true);
        }
    };

	// 退出群聊
	const handleLeaveGroup = async () => {
		if (!confirm("确定要退出群聊吗？")) return;

		// 如果自己是群主，提示需要先转让群主权限
		if (isOwner) {
			alert("退出群聊前请先转让群主权限");
			return;
		}
		if(myRole === 'kicked' || myRole === 'quit'){
			alert("你已不在群聊中");
			return;
		}

        try {
            await request(`${BACKEND_URL}/api/conversations/${chatId}/leave`, "DELETE", true);

            // 刷新 conversation list（ConversationList 已监听）
            window.dispatchEvent(new Event("local_refresh_conversations"));
            window.dispatchEvent(new Event("local_refresh_groups"));
            
            // 本地状态更新：关闭侧边栏、清空消息、锁定标题为已退出
            setIsSidebarOpen(false);
            // setMessages([]);
            setIsKicked(true);
            // setIsTitleLocked(true);
            // setChatTitle("已退出群聊");

            alert('已退出群聊');
        } catch (error) {
            console.error("退出群聊失败:", error);
            alert('退出群聊失败，请重试');
            return;
        }
	};

    // 工业级智能时间格式化函数（彻底解决 Invalid Date 和跨浏览器兼容问题）
    const formatMessageTime = (timeInput?: string | number) => {
        if (!timeInput) return "";
        
        let date: Date;

        
        // 1. 强力数据清洗：如果是字符串，处理后端各种奇葩格式
        if (typeof timeInput === 'string') {
            // 修复1：把中间的空格替换成标准 ISO 格式的 'T' (例如 "2026-05-19 14:30:00" -> "2026-05-19T14:30:00")
            let safeString = timeInput.replace(" ", "T");
            date = new Date(safeString);
            
            // 修复2：iOS/Safari 特供兜底。如果加了 T 还是 Invalid，就强制转换成 "YYYY/MM/DD HH:mm:ss" 格式
            if (isNaN(date.getTime())) {
                safeString = timeInput.replace(/-/g, '/').replace("T", " ");
                // 砍掉可能导致解析失败的小数点微秒部分 (例如 .123456)
                safeString = safeString.split('.')[0]; 
                date = new Date(safeString);
            }
        } else {
            // 如果传来的是时间戳数字，直接转换
            date = new Date(timeInput);
        }

        // 2. 终极防崩溃：如果用尽所有办法还是解析失败，直接原样返回，绝对不能在界面上显示 "Invalid Date"
        if (isNaN(date.getTime())) return String(timeInput);

        // 3. 正常的时间智能格式化逻辑
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();

        const isThisYear = date.getFullYear() === now.getFullYear();

        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (isToday) {
            return timeStr;
        } else if (isYesterday) {
            return `昨天 ${timeStr}`;
        } else if (isThisYear) {
            return `${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
        } else {
            return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
        }
    };

    const handleSendMessage = (text: string) => {
        if (isKicked) {
            alert("您已被移出群聊，无法发送消息");
            return;
        }
        if (isReadOnly) {
            alert("对方已注销，无法发送消息");
            return;
        }
        if (isFiltering) return alert("筛选模式下无法发送消息，请先退出筛选");
        const tempMsg: Message = {
            msgId: Date.now(),
            senderId: currentUserId,
            msgBody: text,
            createTime: new Date().toISOString(),
            avatarUrl: currentUserAvatar || "", 
            senderName: myNickname,
            replyTo: replyPreview?.msgId,
            showReply: Boolean(replyPreview?.msgId),
            replyNum: 0,
        };
        setMessages(prev => {
            const updated = replyPreview?.msgId
                ? prev.map(message => (
                    String(message.msgId) === String(replyPreview.msgId)
                        ? { ...message, replyNum: (message.replyNum || 0) + 1 }
                        : message
                ))
                : prev;
            return [...updated, tempMsg];
        });
        setReplyPreview(undefined);

        justSentRef.current = true;
        isNearBottomRef.current = true;

        window.dispatchEvent(new CustomEvent("global_send_request", {
            detail: {
                type: "chat_message",
                data: {
                    conversation_id: Number(chatId),
                    content: text,
                    msg_type: "text",
                    temp_id: String(tempMsg.msgId),
                    reply_to: replyPreview?.msgId,
                }
            }
        }));

    
        window.dispatchEvent(new Event("local_message_sent"));
    };

    const handleDeleteMessage = async (msgId?: number) => {
        if (!msgId) return;
    // 乐观更新：先从本地 state 删除该条消息
    suppressAutoScrollRef.current = true;
    setMessages(prev => prev.filter(m => String(m.msgId) !== String(msgId)));

        try {
            await request(`${BACKEND_URL}/api/conversations/${chatId}/messages/${msgId}`, "DELETE", true);
            // 发送事件通知 ConversationList 更新最后消息预览
            window.dispatchEvent(new Event("local_message_sent"));
        } catch (err: any) {
            console.error("删除消息失败，正在回滚:", err);
            // 否则回滚：重新拉取历史或将消息恢复到本地 state
            try {
                suppressAutoScrollRef.current = true;
                await fetchHistory();
            } catch (err2) {
                console.error("回滚时重新获取消息失败:", err2);
            }
        }
    };

	const handleClearMessages = async () => {
		if (!window.confirm("确定要清空聊天记录吗？此操作不可撤销！")) return;
		// 乐观更新：先清空本地消息列表
		suppressAutoScrollRef.current = true;
		setMessages([]);
		// 发送请求
		request(`${BACKEND_URL}/api/conversations/${chatId}/messages`, "DELETE", true);
		try {
            await request(`${BACKEND_URL}/api/conversations/${chatId}/messages`, "DELETE", true);
            // 发送事件通知 ConversationList 更新最后消息预览
            window.dispatchEvent(new Event("local_message_sent"));
        } catch (err: any) {
            console.error("删除消息失败，正在回滚:", err);
            // 否则回滚：重新拉取历史或将消息恢复到本地 state
            try {
                suppressAutoScrollRef.current = true;
                await fetchHistory();
            } catch (err2) {
                console.error("回滚时重新获取消息失败:", err2);
            }
        }
	}

    return (
        <div style={{
            position: 'relative',
            display: 'flex', flexDirection: 'column', height: '100%', // 改为 100%
            width: '100%', // 宽度撑满
            backgroundColor: '#fff', border: '1px solid #eee',
            borderRadius: '8px', boxShadow: `0 12px 40px ${theme.shadow}, 0 4px 12px rgba(0, 0, 0, 0.03)`,
            overflow: 'hidden'
        }}>
            {/* 顶部标题栏 */}
            <div style={{ 
                height: '60px', // 固定高度
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                borderBottom: `1px solid ${theme.border}` ,
                backgroundColor: '#fff',
                position: 'relative', // 为以后可能在左右加按钮做准备
                boxShadow: `0 1px 4px ${theme.shadow}` // 轻微底部阴影
            }}>
            <div style={{ 
                fontWeight: 'bold', 
                fontSize: '20px',
                color: theme.textPrimary,
                display: 'flex', alignItems: 'center', gap: '10px'
            }}>
                {chatTitle}
                {isUserOut && (
                    <span style={{ fontSize: '13px', color: theme.danger, fontWeight: 'normal', backgroundColor: theme.dangerLight, padding: '4px 10px', borderRadius: '12px' }}>
                            已离开
                        </span>
                )}
            </div>

                {/* 右上角按钮 */}
                {!isUserOut && (
                    <button 
                        onClick={() => setIsSidebarOpen(true)}
                        style={{ position: 'absolute', right: '20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: theme.textSecondary, padding: '8px', transition: theme.transition }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.primaryLight; e.currentTarget.style.color = theme.primary; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = theme.textSecondary; }}
                    >⋯</button>
                )}
            </div>
            
            {/* 消息展示区域 */}
            <div 
                ref={scrollContainerRef}
                onScroll={handleScroll}
                style={{
                    flex: 1, 
                    overflowY: 'auto', 
                    padding: '10px 20px',
                    backgroundColor: theme.bgLight, 
                    borderRadius: '8px', 
                    marginBottom: '20px',
                    display: 'flex', 
                    flexDirection: 'column',
                    // 🌟 核心：如果还没加载好，先不可见，防止闪烁
                    visibility: messages.length === 0 && isFirstLoad.current ? 'hidden' : 'visible'
                }}
            >
                {/* (不再是全屏覆盖) */}
                {isUserOut && (
                    <div style={{ textAlign: 'center', color: theme.danger, fontSize: '13px', padding: '10px 0', marginTop: '10px', marginBottom: '20px', backgroundColor: theme.dangerLight, borderRadius: '8px', border: `1px solid rgba(255, 107, 129, 0.2)` }}>
                        您已退出该群聊或被移出
                    </div>
                )}           
            
                {/* 筛选提示条 */}
                {isFiltering && (
                    <div style={{ backgroundColor: '#fffbe6', padding: '12px 20px', borderBottom: '1px solid #ffe58f', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 2px 5px rgba(0,0,0,0.03)', marginBottom: '10px', borderRadius: '4px' }}>
                        <div style={{ fontSize: '13px', color: '#faad14', fontWeight: 500 }}>
                            <span style={{ marginRight: '8px' }}>🔍</span>正在查看历史筛选记录
                        </div>
                        <button onClick={clearSearch} style={{ background: '#faad14', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                            退出筛选
                        </button>
                    </div>
                )}

                {/* 消息列表 */}
                {messages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#999', marginTop: '20px' }}>
                        {isUserOut 
                            ? "已经不在这个群里了哦~~" 
                            : (isFiltering ? "没有符合该时间段的聊天记录" : "暂无消息记录")
                        }
                    </div>
                ) : (
                    messages.map(msg => {
                        const replyTarget = msg.replyTo ? messages.find(m => String(m.msgId) === String(msg.replyTo)) : undefined;
                        return (
                            <div
                                key={msg.msgId}
                                ref={(node) => { messageRefs.current[String(msg.msgId)] = node ?? undefined; }}
                            >
                                <MessageItem
                                    msgBody={msg.msgBody}
                                    createTime={formatMessageTime(msg.createTime)}
                                    isMine={String(msg.senderId) === String(currentUserId)}
                                    avatarUrl={msg.avatarUrl}
                                    senderName={msg.senderName}
                                    msgId={msg.msgId}
                                    showReply={Boolean(replyTarget)}
                                    replyContent={replyTarget?.msgBody}
                                    replySenderName={replyTarget?.senderName}
                                    replySendTime={replyTarget?.createTime ? formatMessageTime(replyTarget.createTime) : undefined}
                                    replyNum={msg.replyNum}
                                    onReply={(payload) => setReplyPreview(payload)}
                                    onDelete={(id) => handleDeleteMessage(id)}
                                    onReplyQuoteClick={() => handleScrollToMessage(msg.replyTo)}
                                    highlight={highlightMsgId === msg.msgId}
                                />
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* 输入区域 */}
            {!isUserOut ? (
                <div style={{ position: 'relative' }}>
                    <ChatInput onSend={handleSendMessage} replyPreview={replyPreview} onCancelReply={() => setReplyPreview(undefined)} disabled={isReadOnly} />
                    {isFiltering && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.6)', zIndex: 5, cursor: 'not-allowed' }} />}
                </div>
            ) : (
                <div style={{ 
                    padding: '20px', textAlign: 'center', color: theme.textSecondary, 
                    backgroundColor: '#f9f9f9', borderTop: '1px solid #eee',
                    fontSize: '14px', fontWeight: 500, borderRadius: '8px'
                }}>
                    🚫 您已离开群聊，无法发送新消息
                </div>
            )}

            <ChatSidebar 
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                theme={theme} // 如果你上方定义了 theme 变量，记得传进去
                isSearchPanelOpen={isSearchPanelOpen}
                setIsSearchPanelOpen={setIsSearchPanelOpen}
                groupInfo={groupInfo}
                currentUserId={currentUserId}
                chatId={chatId}
                isGroupInfoLoading={isGroupInfoLoading}
                fetchGroupInfo={fetchGroupInfo}
                settings={settings}
                updateSetting={updateSetting}
                canReviewInvites={canReviewInvites}
                setIsInviteModalOpen={setIsInviteModalOpen}
                setIsReviewModalOpen={setIsReviewModalOpen}
                handleClearMessages={handleClearMessages}
                handleLeaveGroup={handleLeaveGroup}
                filterStartTime={filterStartTime}
                setFilterStartTime={setFilterStartTime}
                filterEndTime={filterEndTime}
                setFilterEndTime={setFilterEndTime}
                filterSenderId={filterSenderId}
                setFilterSenderId={setFilterSenderId}
                applySearch={applySearch}
                getPermissions={getPermissions}
                handleMemberAction={handleMemberAction}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                getValidAvatarUrl={getValidAvatarUrl}
            />

            {groupInfo && (
                <>
                    <GroupInviteModal
                        open={isInviteModalOpen}
                        conversationId={chatId}
                        onClose={() => setIsInviteModalOpen(false)}
                    />
                    <GroupInviteReviewModal
                        open={isReviewModalOpen}
                        conversationId={chatId}
                        canReview={canReviewInvites}
                        reviewerId={currentUserId}
                        onReviewed={(action) => {
                            if (action === "approved") {
                                fetchGroupInfo();
                            }
                        }}
                        onClose={() => setIsReviewModalOpen(false)}
                    />
                </>
            )}

        </div>
    );
};

export default ChatRoom;