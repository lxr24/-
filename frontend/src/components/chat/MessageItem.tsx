import React from 'react';
import { MessageHover } from './MessageHover';

// 定义传入的属性
interface MessageItemProps {
    msgBody: string; // 消息内容
    createTime: string; // 消息创建时间
    isMine: boolean; // 是否是自己发出的消息
    avatarUrl: string; // 头像URL
    senderName?: string; //来提取名字最后两个字
    msgId?: number;

    showReply?: boolean; // 是否显示引用框
    replyContent?: string; // 回复消息的内容
    replySenderName?: string; // 回复消息的发送者名字
    replySendTime?: string; // 回复消息的发送时间
    replyNum?: number; // 本消息被多少条消息引用了
    onReply?: (payload: { content: string; senderName?: string; sendTime?: string; msgId?: number }) => void;
    onDelete?: (msgId?: number) => void;
    onReplyQuoteClick?: () => void;
    highlight?: boolean;

}

export const MessageItem: React.FC<MessageItemProps> = ({ msgBody, createTime, isMine, avatarUrl, senderName, showReply, replyContent, replySenderName, replySendTime, replyNum, onReply, msgId, onDelete, onReplyQuoteClick, highlight }) => {
    const trimmedAvatarUrl = avatarUrl?.trim();
    // 传来的图片url似乎有两种格式，对应不同的方法，这里干脆统一加工成一样的，正确的访问url格式应当是 "api/upload/xxxxxx.png"之类的
    const finalAvatarUrl = trimmedAvatarUrl
        ? (trimmedAvatarUrl.startsWith('http')
            ? trimmedAvatarUrl
            : trimmedAvatarUrl.startsWith('/api')
                ? trimmedAvatarUrl
                : trimmedAvatarUrl.startsWith('/')
                    ? `/api${trimmedAvatarUrl}`
                    : `/api/${trimmedAvatarUrl}`)
        : '';

    const fallbackText = senderName ? senderName.slice(-2).toUpperCase() : "?";
    const bubbleColor = isMine ? '#95ec69' : '#fff';
    const bubbleBorderColor = isMine ? '#6fbe4f' : '#d9d9d9';

    // 悬浮窗控制
    const [showHover, setShowHover] = React.useState(false);
    const hoverTimerRef = React.useRef<number | undefined>(undefined); // 计时，长于500ms才显示悬浮窗
    const handleMouseEnter = () => {
        if (hoverTimerRef.current) {
            window.clearTimeout(hoverTimerRef.current);
        }
        hoverTimerRef.current = window.setTimeout(() => {
            setShowHover(true);
            hoverTimerRef.current = undefined;
        }, 500) as unknown as number;
    }; 
    const handleMouseLeave = () => {
        if (hoverTimerRef.current) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = undefined;
        }
        setShowHover(false);
    };
    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => { // 右键点击时显示悬浮窗
        e.preventDefault();
        setShowHover(true);
    };
    const handleReply = () => {
        if (onReply) {
            onReply({
                content: msgBody,
                senderName,
                sendTime: createTime,
                msgId,
            });
        }
        setShowHover(false);
    };
    const handleDelete = () => {
        if (onDelete) {
            onDelete(msgId);
        }
        setShowHover(false);
    };
    // 悬浮窗控制结束

    return (
        <div
            className={highlight ? "message-highlight" : undefined}
            style = {{
                display: 'flex',
                flexDirection: isMine ? 'row-reverse' : 'row', // 根据是否是自己的消息调整排列方向,你紧靠左，我紧靠右~~
                alignItems: 'flex-start', // 垂直对齐方式
                marginBottom: '20px',
                position: 'relative' // 为了悬浮窗能够正确定位在消息项上
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
        >
            {/* 头像区域：有图片用图片，没图片用 CSS 圆圈 */}
            {finalAvatarUrl ? (
                <img
                    src={finalAvatarUrl}
                    alt={isMine ? "我的头像" : "对方的头像"}
                    style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        margin: isMine ? '0 0 0 12px' : '0 12px 0 0',
                        flexShrink: 0,
                        objectFit: 'cover'
                    }}
                />
                ) : (
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    // 自己发的消息和个人主页一样用黄色，对方发的消息和好友列表一样用蓝色
                    backgroundColor: isMine ? "#fcbc32ff" : "#1890ff", 
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxSizing: 'border-box',
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
                    fontWeight: 700,
                    fontSize: "14px",
                    margin: isMine ? '0 0 0 12px' : '0 12px 0 0',
                    flexShrink: 0,
                }}>
                    {fallbackText}
                </div>
            )}
            
            {/* 气泡与时间（保持不变） */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: bubbleColor,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    maxWidth: '400px',
                    wordWrap: 'break-word',
                    fontSize: '15px',
                    position: 'relative'
                }}>
                    <MessageHover
                        visible={showHover}
                        anchor={isMine ? 'left' : 'right'}
                        onReply={handleReply}
                        onDelete={handleDelete}
                    />
                    {/* 引用框 */}
                    {showReply && replyContent && (
                        <div
                            style={{
                            backgroundColor: isMine ? 'rgba(0,0,0,0.08)' : '#f5f5f5',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            marginBottom: '8px',
                            fontSize: '12px',
                            color: '#666',
                            borderLeft: '3px solid #565757ff',
                            cursor: 'pointer'
                        }}
                            onClick={onReplyQuoteClick}
                        >
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 2,
                            }}>
                                <div style={{ fontWeight: 500 }}>
                                    {replySenderName}
                                </div>
                                <div style={{ fontSize: '10px', color: '#999' }}>
                                    {replySendTime}
                                </div>
                            </div>
                            <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                {replyContent}
                            </div>
                        </div>
                    )}

                    {/* 消息内容 */}
                    {msgBody}

                    {replyNum && replyNum >= 1 ? (
                        <div
                            style={{
                                position: 'absolute',
                                top: '0%',
                                transform: 'translateY(-50%)',
                                [isMine ? 'left' : 'right']: '-20px',
                                minWidth: '25px',
                                height: '25px',
                                padding: '0 6px',
                                borderRadius: '999px',
                                border: `1px solid ${bubbleBorderColor}`,
                                backgroundColor: bubbleColor,
                                color: isMine ? '#3f6b30ff' : '#666',
                                fontSize: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxSizing: 'border-box',
                                marginRight: '2px',
                            }}
                        >
                            <span style={{ marginRight: '2px', lineHeight: 1, fontSize: '18px' }}>💬</span>
                            {replyNum}
                        </div>
                    ) : undefined}
                </div>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                    <div style={{ gap : '12px', display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                        <div style={{ fontSize: '12px', color: '#999' }}>
                            {createTime}
                        </div>
                    </div>
                </div>
                
            </div>
        </div>
    );
}