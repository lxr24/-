import React, { useState, useRef, useEffect } from 'react';

// 用于恢复的props
interface ReplyPreview {
    senderName?: string;
    content?: string;
    sendTime?: string;
}

interface ChatInputProps {
    onSend: (text: string) => void; // 发送消息的回调函数
    replyPreview?: ReplyPreview;
    onCancelReply?: () => void;
    disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, replyPreview, onCancelReply, disabled }) => {
    // 定义输入框的状态
    const [inputText, setInputText] = useState('');
    const inputRef = useRef<HTMLInputElement>(undefined as unknown as HTMLInputElement); // 点击回复后自动进入可输入状态，丝滑一些

    useEffect(() => {
        if (replyPreview?.content && inputRef.current) {
            inputRef.current.focus();
        }
    }, [replyPreview?.content]);

    // 发送
    const handleSend = () => {
        if (disabled) {
            console.log("拦截：输入框被禁用，无法发送"); // F12 控制台看这里！
            return; 
        }
        if (!inputText.trim()) return; // 如果输入为空，直接返回

        onSend(inputText); // 调用父组件传入的发送函数
        setInputText(""); // 发送后清空输入框
    };

    // 监听回车键发送消息
    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    }

    return (
        <div style = {{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto'}}>
            
            {/* 引用栏，显示被回复消息的预览 */}
            {replyPreview?.content ? (
                <div style={{
                    backgroundColor: '#f5f5f5',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#666',
                    borderLeft: '3px solid #1890ff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    maxWidth: '1180px',
                    width: '100%',
                    overflow: 'hidden'
                }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, marginBottom: 2 }}>
                            {replyPreview.senderName || '引用'}
                        </div>
                        {replyPreview.sendTime ? (
                            <div style={{ fontSize: '10px', color: '#999', marginBottom: 4 }}>
                                {replyPreview.sendTime}
                            </div>
                        ) : undefined}
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {replyPreview.content}
                        </div>
                    </div>
                    {onCancelReply ? (
                        <button
                            type="button"
                            onClick={onCancelReply}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#999',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            取消
                        </button>
                    ) : undefined}
                </div>
            ) : undefined}
            {disabled ? (
                <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#f5f5f5',
                    color: '#999',
                    fontSize: '15px',
                    borderRadius: '8px',
                    border: '1px solid #e6e6e6',
                    textAlign: 'center',
                    fontWeight: 500
                }}>
                    对方已注销，无法发送消息
                </div>
            ) : (
                <div style = {{ display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        value = {inputText}
                        onChange = {e => setInputText(e.target.value)}
                        onKeyDown = {handleKeyPress}
                        ref={inputRef}
                        disabled={disabled}
                        style = {{
                            flex: 1,
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: '1px solid #d9d9d9',
                            outline: 'none',
                            fontSize: '15px'
                        }}
                        placeholder="请输入消息内容..."
                    />
                    <button
                        onClick={handleSend}
                        disabled={disabled}
                        style = {{
                            padding: '0 24px',
                            backgroundColor: '#1890ff',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '15px',
                            fontWeight: 500,
                            transition: 'background-color 0.2s' // 鼠标悬停时的过渡效果
                        }}
                        onMouseOver = {(e) => e.currentTarget.style.backgroundColor = '#40a9ff'} // 鼠标悬停时改变背景色
                        onMouseOut = {(e) => e.currentTarget.style.backgroundColor = '#1890ff'} // 鼠标移出时恢复背景色
                    >
                        发送
                    </button>
                </div>
            )}
        </div>
    );
};