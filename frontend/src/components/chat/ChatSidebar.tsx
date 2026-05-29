import React, { useEffect, useState }from 'react';
import { GroupInfo } from "../group/GroupAnnouncementSection";
import { GroupAnnouncementSection } from "../group/GroupAnnouncementSection";
import { request } from "../../utils/network"; 
import { BACKEND_URL } from "../../constants/string";

const ChevronLeftIcon = ({ size = 20, color = 'currentColor' }: any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 19L8 12L15 5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const CloseIcon = ({ size = 18, color = 'currentColor' }: any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18M6 6L18 18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const RoundIconButton = ({ onClick, children, title, theme, style = {} }: any) => (
    <button
        onClick={onClick}
        title={title}
        style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '36px', height: '36px', borderRadius: '50%',
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: theme?.textSecondary || '#666', transition: 'all 0.2s ease',
            ...style
        }}
        onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = '#f0f0f0'; // 鼠标悬浮时的浅灰底色
            e.currentTarget.style.color = theme?.primary || '#1890ff'; // 图标变成主题色
        }}
        onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = theme?.textSecondary || '#666';
        }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'} // 点击时弹性缩小
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
    >
        {children}
    </button>
);

interface SwitchProps { // 滑动开关需要
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const Switch: React.FC< SwitchProps > = ({checked, onChange, disabled = false}) => {
    const [ripple, setRipple] = useState(false);

    const handleClick = () => {
        if (disabled) return;
        setRipple(true);
        onChange(!checked);
        setTimeout(() => setRipple(false), 400);
    };
    return (
    <div
      onClick={handleClick}
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        backgroundColor: checked ?  '#9381ff' : '#c9cdd4',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
        opacity: disabled ? 0.5 : 1,
        boxShadow: checked ? 'rgba(147, 129, 255, 0.15)' : 'inset 0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
      }}
      role="switch"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
        {ripple && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: checked ? 'rgba(255, 255, 255, 0.3)' : '#9381ff',
            animation: 'ripple 0.4s ease-out forwards',
          }}
        />
      )}
        {/* 滑块 */}
        <div
            style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: '#fff',
                position: 'absolute',
                top: '3px',
                left: checked ? '23px' : '3px',
                transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)',
                zIndex: 1,
            }}
        />
    </div>
  );
};

export interface ConversationSettings {
    do_not_disturb: boolean;
    is_pinned: boolean;
}

// 定义需要从父组件传进来的所有状态和方法
interface ChatSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    theme: any; 
    isSearchPanelOpen: boolean;
    setIsSearchPanelOpen: (v: boolean) => void;
    groupInfo?: GroupInfo;
    currentUserId: number;
    chatId: string;
    isGroupInfoLoading: boolean;
    fetchGroupInfo: () => void;
    settings: any;
    updateSetting: (key: keyof ConversationSettings, val: boolean) => void;
    canReviewInvites: boolean;
    setIsInviteModalOpen: (v: boolean) => void;
    setIsReviewModalOpen: (v: boolean) => void;
    handleClearMessages: () => void;
    handleLeaveGroup: () => void;
    filterStartTime: string;
    setFilterStartTime: (v: string) => void;
    filterEndTime: string;
    setFilterEndTime: (v: string) => void;
    filterSenderId: string;
    setFilterSenderId: (v: string) => void;
    applySearch: () => void;
    getPermissions: (role: string, id: number) => any;
    handleMemberAction: (id: number, action: any) => void;
    openMenuId?: number;
    setOpenMenuId: (id?: number) => void;
    getValidAvatarUrl: (url?: string) => string | undefined;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = (props) => {
    const {
        isOpen, onClose, theme, isSearchPanelOpen, setIsSearchPanelOpen, groupInfo, currentUserId, chatId,
        isGroupInfoLoading, fetchGroupInfo, settings, updateSetting, canReviewInvites,
        setIsInviteModalOpen, setIsReviewModalOpen, handleClearMessages, handleLeaveGroup,
        filterStartTime, setFilterStartTime, filterEndTime, setFilterEndTime, filterSenderId, setFilterSenderId,
        applySearch, getPermissions, handleMemberAction, getValidAvatarUrl
    } = props;

    // 获取今天的日期 (限制日历不能选未来)
    const today = new Date().toISOString().split('T')[0];
    const [selectedMember, setSelectedMember] = useState<any>(undefined);

    useEffect(() => {
        if (!selectedMember || !groupInfo?.members?.length) return;
        const latest = groupInfo.members.find(member => String(member.user_id) === String(selectedMember.user_id));
        if (!latest) {
            setSelectedMember(undefined);
            return;
        }
        if (latest !== selectedMember) {
            setSelectedMember(latest);
        }
    }, [groupInfo, selectedMember]);

    // 发送好友申请逻辑
    const handleAddFriend = async (targetId: number) => {
        try {
            await request(`${BACKEND_URL}/api/friends/request/${targetId}`, "POST", true);
            alert("好友申请发送成功！");
        } catch (err: any) {
            alert(err.message || "发送申请失败，可能已经是好友了哦");
        }
    };

    // 统一样式的按钮组件
    const ActionButton = ({ onClick, ccolor, bgColor, icon, text, hoverBgColor }: any) => (
        <button
            onClick={onClick}
            style={{
                width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                backgroundColor: bgColor, color: ccolor, border: 'none', 
                borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
            }}
            onMouseEnter={e => { 
                e.currentTarget.style.backgroundColor = hoverBgColor; 
            }}
            onMouseLeave={e => { 
                e.currentTarget.style.backgroundColor = bgColor; 
                e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseDown={e => {
                e.currentTarget.style.transform = 'scale(0.96)'; // 按下时缩小一点点，手感极佳
            }}
            onMouseUp={e => {
                e.currentTarget.style.transform = 'scale(1)';
            }}
        >
            <span style={{ fontSize: '16px' }}>{icon}</span> {text}
        </button>
    );

    return (
        <>
            {/* 侧边栏的半透明遮罩层 (点击关闭) */}
            {isOpen && (
                <div 
                    onClick={onClose}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.15)', zIndex: 100 }}
                />
            )}

            {/* 侧边栏面板主体 */}
            <div style={{
                position: 'absolute', top: 0, right: isOpen ? 0 : '-320px', 
                width: '320px', height: '100%', backgroundColor: '#fcfcfc', 
                boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', transition: 'right 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                zIndex: 101, display: 'flex', flexDirection: 'column',
            }}>
                
                {/* 顶部导航栏 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', backgroundColor: '#fff', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
                    {selectedMember ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <RoundIconButton 
                                onClick={() => setSelectedMember(undefined)} 
                                title="返回详情" 
                                theme={theme} 
                                style={{ marginLeft: '-10px' }}
                            >
                                <ChevronLeftIcon />
                            </RoundIconButton>
                            <h3 style={{ margin: 0, fontSize: '16px', color: theme?.textPrimary || '#333' }}>成员信息</h3>
                        </div>
                    ): isSearchPanelOpen ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <RoundIconButton onClick={() => setIsSearchPanelOpen(false)} title="返回详情" theme={theme} style={{ marginLeft: '-10px' }}>
                                <ChevronLeftIcon/>
                            </RoundIconButton>
                            <h3 style={{ margin: 0, fontSize: '16px', color: theme?.textPrimary || '#333' }}>日期筛选</h3>
                        </div>
                    ) : (
                        <h3 style={{ margin: 0, fontSize: '17px', color: theme?.textPrimary || '#333', fontWeight: 600 }}>
                            {groupInfo ? "群聊详情" : "聊天详情"}
                        </h3>
                    )}
                    <RoundIconButton onClick={onClose} title="关闭侧边栏" theme={theme}>
                        <CloseIcon/>
                    </RoundIconButton>
                </div>

                {/* 核心内容区 */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* 1. 成员详情面板 (优先级最高) */}
                    {selectedMember ? (() => {
                        const safeAvatar = getValidAvatarUrl(selectedMember.avatar_url);
                        const p = getPermissions(selectedMember.role, selectedMember.user_id);
                        const isMyself = String(selectedMember.user_id) === String(currentUserId);

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.3s ease' }}>
                                {/* 头部信息卡片 */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#fff', padding: '30px 20px', borderRadius: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', border: '1px solid #f5f5f5' }}>
                                    <div style={{ position: 'relative', width: '80px', height: '80px', marginBottom: '16px' }}>
                                        {safeAvatar ? (
                                            <img src={safeAvatar} alt="avatar" onError={(e) => e.currentTarget.style.display = 'none'} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundColor: '#1890ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '24px', boxShadow: '0 4px 12px rgba(24,144,255,0.3)' }}>
                                                {(selectedMember.nickname || selectedMember.username || "?").slice(-2).toUpperCase()}
                                            </div>
                                        )}
                                        {selectedMember.role === 'owner' && <span style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '24px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>👑</span>}
                                        {selectedMember.role === 'admin' && <span style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '24px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>🛡️</span>}
                                    </div>
                                    <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', color: '#1f2329' }}>{selectedMember.nickname || selectedMember.username}</h2>
                                    <span style={{ fontSize: '13px', color: '#8f959e' }}>@{selectedMember.username}</span>
                                    {isMyself && <span style={{ marginTop: '8px', padding: '2px 8px', backgroundColor: '#f0f0f0', color: '#666', borderRadius: '10px', fontSize: '12px' }}>这是我</span>}
                                </div>

                                {/* 操作按钮组 */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {!isMyself && (
                                        <ActionButton onClick={() => handleAddFriend(selectedMember.user_id)} 
                                            color="#1890ff" bgColor="#e6f7ff" hoverBgColor="#bae0ff" icon="👋" text="加为好友" />
                                    )}
                                    {p.setAdmin && (
                                        <ActionButton onClick={() => handleMemberAction(selectedMember.user_id, 'set_admin')} 
                                            color="#52c41a" bgColor="#f6ffed" hoverBgColor="#d9f7be" icon="🛡️" text="设为管理员" />
                                    )}
                                    {p.cancelAdmin && (
                                        <ActionButton onClick={() => handleMemberAction(selectedMember.user_id, 'cancel_admin')} 
                                            color="#fa8c16" bgColor="#fff7e6" hoverBgColor="#ffe58f" icon="👇" text="取消管理员" />
                                    )}
                                    {p.transfer && (
                                        <ActionButton onClick={() => { handleMemberAction(selectedMember.user_id, 'transfer'); setSelectedMember(undefined); }} 
                                            color="#fa8c16" bgColor="#fff7e6" hoverBgColor="#ffe58f" icon="👑" text="转让群主" />
                                    )}
                                    {p.remove && (
                                        <ActionButton onClick={() => { handleMemberAction(selectedMember.user_id, 'remove'); setSelectedMember(undefined); }} 
                                            color="#ff4d4f" bgColor="#fff1f0" hoverBgColor="#ffccc7" icon="🚫" text="移出群聊" />
                                    )}
                                </div>
                            </div>
                        );
                    })() :

                    isSearchPanelOpen ? (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'fadeIn 0.3s ease' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: 500 }}>起始日期</div>
                                <input type="date" value={filterStartTime} max={filterEndTime || today} onChange={e => setFilterStartTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d9d9d9', borderRadius: '8px' }} />
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: 500 }}>结束日期</div>
                                <input type="date" value={filterEndTime} min={filterStartTime || undefined} max={today} onChange={e => setFilterEndTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d9d9d9', borderRadius: '8px' }} />
                            </div>
                            {groupInfo && groupInfo.members && (
                                <div style={{ marginBottom: '30px' }}>
                                    <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: 500 }}>发言人</div>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: '8px', backgroundColor: '#fff', padding: '4px' }}>
                                        <div onClick={() => setFilterSenderId("")} style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', backgroundColor: filterSenderId === "" ? '#e6f7ff' : 'transparent', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👥</div>
                                            <span style={{ fontSize: '14px', color: '#333' }}>全部成员</span>
                                        </div>
                                        {groupInfo.members.map(member => {
                                            const safeAvatar = getValidAvatarUrl(member.avatar_url);
                                            return (
                                                <div key={member.user_id} onClick={() => setFilterSenderId(String(member.user_id))} style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', backgroundColor: filterSenderId === String(member.user_id) ? '#e6f7ff' : 'transparent', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    {safeAvatar ? <img src={safeAvatar} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#1890ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '11px', flexShrink: 0 }}>{(member.nickname || member.username || "?").slice(-2).toUpperCase()}</div>}
                                                    <span style={{ fontSize: '14px', color: '#333' }}>{member.nickname || member.username}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <button onClick={applySearch} style={{ width: '100%', padding: '12px', backgroundColor: '#1890ff', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>立即查找</button>
                        </div>
                    ): (

                    /* 默认群信息主面板 */
                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                            {/* 群成员区域 */}
                            {groupInfo && (
                                <div>
                                    <div style={{ fontSize: '13px', color: theme?.textPrimary || '#333', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>群成员</span><span>共 {groupInfo.members?.length || 0} 人</span>
                                    </div>
                                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', maxHeight: '260px', overflowY: 'auto', border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 8px', alignItems: 'start' }}>
                                            {groupInfo.members?.sort((a, b) => {
                                                const weights: Record<string, number> = { 'owner': 1, 'admin': 2, 'member': 3 };
                                                return (weights[a.role] || 9) - (weights[b.role] || 9);
                                            })?.map(member => {
                                                const safeAvatar = getValidAvatarUrl(member.avatar_url);
                                                return (
                                                    <div 
                                                        key={member.user_id} 
                                                        // 点击头像直接设置 selectedMember，滑出详细面板
                                                        onClick={() => setSelectedMember(member)}
                                                        style={{ textAlign: 'center', position: 'relative', cursor: 'pointer', transition: 'transform 0.2s' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                    >
                                                        <div style={{ position: 'relative', width: '48px', height: '48px', margin: '0 auto' }}>
                                                            {safeAvatar ? (
                                                                <img src={safeAvatar} alt="avatar" onError={(e) => e.currentTarget.style.display = 'none'} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: member.role === 'owner' ? '2px solid #faad14' : '1px solid #f0f0f0', boxSizing: 'border-box' }} />
                                                            ) : (
                                                                <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundColor: member.role === 'owner' ? '#faad14' : '#1890ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '14px', border: member.role === 'owner' ? '2px solid #faad14' : 'none', boxSizing: 'border-box' }}>
                                                                    {(member.nickname || member.username || "?").slice(-2).toUpperCase()}
                                                                </div>
                                                            )}
                                                            {member.role === 'owner' && <span style={{ position: 'absolute', top: -6, right: -6, fontSize: '14px', zIndex: 10 }}>👑</span>}
                                                            {member.role === 'admin' && <span style={{ position: 'absolute', top: -6, right: -6, fontSize: '14px', zIndex: 10 }}>🛡️</span>}
                                                        </div>
                                                        <div style={{ marginTop: '6px', fontSize: '11px', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.nickname || member.username}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '24px' }}>
                                        <GroupAnnouncementSection chatId={chatId} groupInfo={groupInfo} isLoading={isGroupInfoLoading} currentUserId={currentUserId} onRefresh={fetchGroupInfo} />
                                    </div>
                                </div>
                            )}

                            {/* 设置列表 */}
                            <div style={{ marginTop: '24px' }}>
                                <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>设置</div>
                                <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f0f0f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                    <div onClick={() => setIsSearchPanelOpen(true)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #f6f6f6' }}>
                                        <span style={{ fontSize: '14px', color: '#333' }}>查找聊天记录</span><span style={{ color: '#ccc', fontSize: '16px' }}>&rsaquo;</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f5f5f5', transition: 'all 0.2s ease' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f7f8fa'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <span style={{ fontSize: '14px', color: '#1f2329' }}>置顶聊天</span>
                                        <Switch checked={settings.is_pinned} onChange={(checked) => updateSetting('is_pinned', checked)} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', transition: 'all 0.2s ease' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f7f8fa'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <span style={{ fontSize: '14px', color: '#1f2329' }}>消息免打扰</span>
                                        <Switch checked={settings.do_not_disturb} onChange={(checked) => updateSetting('do_not_disturb', checked)} />
                                    </div>
                                </div>
                            </div>

                            {/* 群管理区域 */}
                            {groupInfo && (
                                <div style={{ marginTop: '24px' }}>
                                    <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>群管理</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f0f0f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                        <div onClick={() => setIsInviteModalOpen(true)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #f6f6f6' }}>
                                            <span style={{ fontSize: '14px', color: '#333' }}>邀请好友</span><span style={{ color: '#ccc', fontSize: '16px' }}>&rsaquo;</span>
                                        </div>
                                        <div onClick={() => { if (canReviewInvites) setIsReviewModalOpen(true); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: canReviewInvites ? 'pointer' : 'not-allowed', opacity: canReviewInvites ? 1 : 0.5 }}>
                                            <span style={{ fontSize: '14px', color: '#333' }}>入群审批</span><span style={{ color: '#ccc', fontSize: '16px' }}>&rsaquo;</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 危险操作区 */}
                            <div style={{ marginTop: '30px' }}>
                                <button onClick={handleClearMessages} style={{ width: '100%', padding: '12px', backgroundColor: '#fff', border: '1px solid #ff4d4f', borderRadius: '10px', cursor: 'pointer', color: '#ff4d4f', fontWeight: 600, fontSize: '14px' }}>清空聊天记录</button>
                            </div>
                            {groupInfo && (
                                <div style={{ marginTop: '20px' }}>
                                    <button onClick={handleLeaveGroup} style={{ width: '100%', padding: '12px', backgroundColor: '#fff', border: '1px solid #ff4d4f', borderRadius: '10px', cursor: 'pointer', color: '#ff4d4f', fontWeight: 600, fontSize: '14px' }}>退出群聊</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <style>
                    {`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateX(10px); }
                        to { opacity: 1; transform: translateX(0); }
                    }
                    `}
            </style>
        </>
    );
};