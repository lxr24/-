import React, { useEffect, useState } from 'react';
import { request } from '../../utils/network';
import { BACKEND_URL } from '../../constants/string';
import { useSelector } from 'react-redux';
import { RootState } from '../../redux/store';
import { useRouter } from 'next/router';

// ================= 🌟 1. 高级 UI 组件区 (VOX Style) =================

const ChevronLeftIcon = ({ size = 20, color = 'currentColor' }: any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 19L8 12L15 5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

// 🌟 满血版：VOX 专属果冻感圆形图标按钮
const RoundIconButton = ({ onClick, children, title, hoverBg = '#f3f0ff', hoverColor = '#9381ff', style = {} }: any) => (
    <button
        onClick={onClick} title={title}
        style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '38px', height: '38px', borderRadius: '50%',
            border: 'none', background: 'rgba(147, 129, 255, 0.06)', cursor: 'pointer',
            color: '#9381ff', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 2px 8px rgba(147, 129, 255, 0.04)', ...style
        }}
        onMouseEnter={e => { 
            e.currentTarget.style.backgroundColor = hoverBg; 
            e.currentTarget.style.color = hoverColor; 
        }}
        onMouseLeave={e => { 
            e.currentTarget.style.backgroundColor = style.background || 'rgba(147, 129, 255, 0.06)'; 
            e.currentTarget.style.color = style.color || '#9381ff'; 
            e.currentTarget.style.transform = 'scale(1)'; 
        }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
    >
        {children}
    </button>
);

// VOX 专属渐变色主按钮
const VoxPrimaryButton = ({ onClick, children, disabled }: any) => (
    <button
        onClick={onClick}
        disabled={disabled}
        style={{
            padding: "8px 20px",
            background: disabled ? "#e2e2ec" : "linear-gradient(135deg, #9381ff 0%, #70d6ff 100%)",
            color: disabled ? "#a0a0b8" : "#ffffff",
            border: "none",
            borderRadius: "14px",
            fontWeight: 700,
            fontSize: "14px",
            cursor: disabled ? "not-allowed" : "pointer",
            boxShadow: disabled ? "none" : "0 6px 16px rgba(147, 129, 255, 0.3)",
            transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
            transform: "scale(1)",
        }}
        onMouseEnter={e => {
            if (!disabled) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(147, 129, 255, 0.4)';
            }
        }}
        onMouseLeave={e => {
            if (!disabled) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(147, 129, 255, 0.3)';
            }
        }}
        onMouseDown={e => !disabled && (e.currentTarget.style.transform = 'scale(0.95)')}
        onMouseUp={e => !disabled && (e.currentTarget.style.transform = 'translateY(-2px)')}
    >
        {children}
    </button>
);

// ================= 🌟 2. 逻辑方法区 =================

const getSafeAvatarUrl = (url?: string) => {
    if (!url) return "";
    const trimmed = url.trim();
    if (trimmed.startsWith('http')) return trimmed;
    const pathWithSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    if (pathWithSlash.startsWith('/api/')) return pathWithSlash;
    return `/api${pathWithSlash}`; 
};

interface FriendRequest {
    friendship_id: number;
    user_id: number; 
    username: string;
    nickname: string;
    avatar_url?: string;
    direction: 'sent' | 'received'; 
    status: 'pending' | 'accepted' | 'rejected'; 
    created_at: string; 
}


const FriendRequestsPage: React.FC = () => {
    const router = useRouter();
    const [requests, setRequests] = useState<FriendRequest[]>([]);
    const token = useSelector((state: RootState) => state.auth.token);

    const fetchRequests = async () => {
        try {
            const [sentData, receivedData] = await Promise.all([
                request(`${BACKEND_URL}/api/friends/list?status=all&type=sent`, "GET", true),
                request(`${BACKEND_URL}/api/friends/list?status=all&type=received`, "GET", true)
            ]);
            
            const sentRequests = (sentData || []).map((req: any) => ({ ...req, direction: 'sent' }));
            const receivedRequests = (receivedData || []).map((req: any) => ({ ...req, direction: 'received' }));
            const combinedRequests = [...receivedRequests, ...sentRequests];

            combinedRequests.sort((a, b) => {
                const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return timeB - timeA; 
            });

            setRequests(combinedRequests);
        } catch (err: any) {
            alert(String(err.message || err));
        }
    };

    useEffect(() => { 
        if (token) fetchRequests(); 
    }, [token]);

    const handleAccept = async (friendshipId: number) => {
        try {
            await request(`${BACKEND_URL}/api/friends/accept/${friendshipId}`, "PUT", true);
            alert("已成功添加好友！");
            setRequests(requests.map(req => 
                req.friendship_id === friendshipId ? { ...req, status: 'accepted' } : req
            ));
            window.dispatchEvent(new Event("local_refresh_grouped_friends"));
        } catch (err: any) {
            console.error("完整的错误对象:", err);
            alert(err.message || "同意失败");
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>

            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                marginBottom: '30px', 
                gap: '16px',
                padding: '16px 20px', 
                backgroundColor: 'rgba(255, 255, 255, 0.7)', // 微透玻璃感
                backdropFilter: 'blur(12px)', // 磨砂质感
                borderRadius: '20px', // 圆润边角
                border: '1px solid rgba(255, 255, 255, 0.8)',
                boxShadow: '0 8px 24px rgba(147, 129, 255, 0.06)', // 极淡的紫色悬浮阴影
            }}>
                <RoundIconButton 
                    onClick={() => router.back()} 
                    title="返回上一页"
                    hoverBg="#e6f7ff" // 悬浮变清爽蓝
                    hoverColor="#1890ff"
                >
                    <ChevronLeftIcon />
                </RoundIconButton>
                <h2 style={{ margin: 0, fontSize: '20px', color: '#2d2b55', fontWeight: 800, letterSpacing: '0.5px' }}>
                    好友申请
                </h2>
            </div>
            
            {requests.length === 0 ? <p style={{ color: '#7b7b99', textAlign: 'center', marginTop: '40px' }}>暂无申请记录</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {requests.map(req => {
                        const isReceived = req.direction === 'received';
                        
                        return (
                            <div 
                                key={req.friendship_id} 
                                style={{ 
                                    display: "flex", justifyContent: "space-between", alignItems: "center", 
                                    padding: "16px 20px", backgroundColor: "rgba(255, 255, 255, 0.7)", 
                                    backdropFilter: "blur(10px)", border: "1px solid rgba(255, 255, 255, 0.8)",
                                    borderRadius: "20px", boxShadow: "0 8px 24px rgba(147, 129, 255, 0.05)", 
                                    transition: "all 0.3s ease",
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-3px)';
                                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
                                    e.currentTarget.style.boxShadow = "0 12px 32px rgba(147, 129, 255, 0.12)";
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.7)";
                                    e.currentTarget.style.boxShadow = "0 8px 24px rgba(147, 129, 255, 0.05)";
                                }}
                            >
                                {/* 左侧：带渐变光环的头像和文字 */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    
                                    {/* 渐变外圈 */}
                                    <div style={{
                                        padding: "2px",
                                        background: isReceived 
                                            ? "linear-gradient(135deg, #70d6ff, #9381ff)"  // 收到的申请用冷色渐变
                                            : "linear-gradient(135deg, #f865b0, #ff9770)", // 发出的申请用暖色渐变
                                        borderRadius: "50%",
                                    }}>
                                        {req.avatar_url ? (
                                            <img 
                                                src={getSafeAvatarUrl(req.avatar_url)} 
                                                style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", display: "block" }} 
                                            />
                                        ) : (
                                            <div style={{ 
                                                width: 46, height: 46, borderRadius: "50%", 
                                                backgroundColor: isReceived ? "#1890ff" : "#52c41a", 
                                                display: "flex", alignItems: "center", justifyContent: "center", 
                                                color: "white", fontWeight: "bold", fontSize: "16px", border: "2px solid #fff", boxSizing: 'border-box'
                                            }}>
                                                {(req.nickname || "?").slice(-1).toUpperCase()}
                                            </div>
                                        )}
                                    </div>

                                    {/* 高级配色文字 */}
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: "16px", color: "#2d2b55", marginBottom: "4px" }}>
                                            {req.nickname} <span style={{ color: '#7b7b99', fontSize: '14px', fontWeight: 500 }}>@{req.username}</span>
                                        </div>
                                        <div style={{ color: "#7b7b99", fontSize: "13px", fontWeight: 500, letterSpacing: "0.5px" }}>
                                            {isReceived ? "想加你为好友" : "已发送好友申请"} · {new Date(req.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                {/* 右侧：状态按钮 */}
                                <div>
                                    {isReceived ? (
                                        req.status === 'pending' ? (
                                            <VoxPrimaryButton onClick={() => handleAccept(req.friendship_id)}>
                                                同意
                                            </VoxPrimaryButton>
                                        ) : req.status === 'accepted' ? (
                                            <span style={{ color: '#a0a0b8', fontSize: '14px', fontWeight: 700 }}>已添加</span>
                                        ) : undefined
                                    ) : (
                                        req.status === 'pending' ? (
                                            <VoxPrimaryButton disabled>等待通过</VoxPrimaryButton>
                                        ) : req.status === 'accepted' ? (
                                            <span style={{ color: '#52c41a', fontSize: '14px', fontWeight: 700 }}>已通过</span>
                                        ) : undefined
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );
};

export default FriendRequestsPage;