import React from 'react';

// 悬浮组件的传入信息
interface MessageHover {
    visible: boolean;
    anchor?: 'left' | 'right';
    // TODO
    onReply: () => void;
    onDelete: () => void;
}
export const MessageHover: React.FC<MessageHover> = ({ visible, anchor = 'right', onReply, onDelete }) => {
    if (!visible) {
        return undefined;
    }

    const anchoredStyle: React.CSSProperties = anchor === 'left'
        ? { right: '100%', left: 'auto', transform: 'translateY(-50%) translateX(-8px)' }
        : { left: '100%', right: 'auto', transform: 'translateY(-50%) translateX(8px)' };

    return (
        <div style={{ ...menuContainerStyle, ...anchoredStyle }}>
            <div style={menuItemStyle} 
                onClick={onReply}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#60605fff';
                    e.currentTarget.style.color = '#fefefeff';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#333';
                }}
            >
                回复
            </div>
            <div style={menuItemStyle} 
                onClick={onDelete}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f45454ff';
                    e.currentTarget.style.color = '#f1f8ffff';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#333';
                }}
            >
                删除
            </div>
        </div>
    );
};

// 悬浮菜单样式
const menuContainerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '100%',
    transform: 'translateY(-50%) translateX(8px)',
    background: '#ddddddff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    borderRadius: '4px',
    padding: '4px 8px',
    display: 'flex',
    gap: '2px',
    fontSize: '14px',
    zIndex: 999,
    cursor: 'pointer',
    minWidth: '88px',
    whiteSpace: 'nowrap',
    alignItems: 'center',
    justifyContent: 'center',
};

const menuItemStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: '4px',
  color: '#333',
  transition: 'all 0.2s ease',
};