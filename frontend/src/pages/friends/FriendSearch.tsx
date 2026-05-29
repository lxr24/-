import { useState } from "react"
import { BACKEND_URL } from "../../constants/string"
import { request } from "../../utils/network"
import { useRouter } from 'next/router';

// 路径安全处理，防止出错
const getSafeAvatarUrl = (url?: string) => {
    if (!url) return "";
    const trimmed = url.trim();
    
    // 1. 如果已经是完整的外部 http 链接，直接返回
    if (trimmed.startsWith('http')) return trimmed;
    
    // 2. 补齐开头的斜杠（例如后端返回 "uploads/..." 变成 "/uploads/..."）
    const pathWithSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    
    // 3. 确保包含 /api 前缀，并以绝对路径返回
    if (pathWithSlash.startsWith('/api/')) {
        return pathWithSlash;
    }
    return `/api${pathWithSlash}`; 
};

const ChevronLeftIcon = ({ size = 20, color = 'currentColor' }: any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 19L8 12L15 5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const FriendSearch = () => {
    const router = useRouter();
    const [keyword, setKeyword] = useState("")
    const [results, setResults] = useState<any[]>([])
    // 这个状态用来标记用户是否已经进行过搜索了，初始值是 false
    // 这个状态的作用是为了在用户第一次进入页面时，不显示“没有找到相关用户”的提示信息，只有当用户点击搜索按钮进行过搜索后，如果结果为空才显示这个提示。
    const [hasSearched, setHasSearched] = useState(false);

    // 搜索的实现逻辑
    const handleSearch = async () => {
        try {
            //
            const data = await request(`${BACKEND_URL}/api/friends/search?keyword=${keyword}`, "GET", true);
            setResults(data);
            setHasSearched(true);
            // 调试用，看看后端返回了什么数据
            // console.log("后端返回的原始数据是：", data);
        } catch (err: any){
            // 调试用，看看捕获到了什么错误
            // console.error("捕获到了错误：", err);
            alert(err.message || "搜索失败");
        }
    }

    // 给 results 里的 user 对象加一个 loading 状态或者 disabled 状态
    const [submittingIds, setSubmittingIds] = useState<number[]>([]);
    // 申请好友的逻辑
    const handleAddFriend = async (friendId: number) => {
        setSubmittingIds(prev => [...prev, friendId]);
        try{
            await request(`${BACKEND_URL}/api/friends/request/${friendId}`, "POST", true);
            alert("已发送好友请求");

            // 及时更新 UI，直接把对应用户的 status 改成 pending
            setResults(prevResults => 
                prevResults.map(user => 
                    user.user_id === friendId 
                        ? { ...user, status: 'pending' }
                        : user
                )
            );
        } catch (err: any) {
        // 捕获错误，防止 UI 没反应
        alert(err.message || "申请发送失败");
        }finally {
            setSubmittingIds(prev => prev.filter(id => id !== friendId));
        }
    };

    return (
        <div style = {{ padding: "30px", maxWidth: "500px", margin: "0 auto", fontFamily: "sans-serif" }}>

            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px', gap: '15px' }}>
                {/* 🌟 核心美化点：用 SVG 替换文本，加上弹性动画 */}
                <button
                    onClick={() => router.back()}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '38px', height: '38px', borderRadius: '50%', // 高级的正圆形
                        border: 'none', background: '#f5f5f5', cursor: 'pointer', // 默认浅灰色底色
                        color: '#666', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', // 丝滑过渡动画
                        boxShadow: '0 2px 5px rgba(0,0,0,0.03)' // 淡淡的底层阴影，增加立体感
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#e8e8e8'; // 鼠标悬浮背景加深
                        e.currentTarget.style.color = '#1890ff'; // 箭头变成主题蓝色
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#f5f5f5'; // 移开恢复
                        e.currentTarget.style.color = '#666';
                        e.currentTarget.style.transform = 'scale(1)'; // 确保大小恢复
                    }}
                    onMouseDown={(e) => {
                        e.currentTarget.style.transform = 'scale(0.92)'; // 🌟 高级感来源：点击时按钮会往里缩一下，手感超好！
                    }}
                    onMouseUp={(e) => {
                        e.currentTarget.style.transform = 'scale(1)'; // 松开弹回
                    }}
                    title="返回上一页"
                >
                    {/* 调用你在顶部写好的 SVG 图标，代替文字 */}
                    <ChevronLeftIcon />
                </button>

                <h2 style={{ margin: 0, fontSize: '20px' }}>添加好友</h2>
                <button 
                    onClick={() => router.push("/friends/FriendRequestsPage")}
                    style={{ 
                        marginLeft: 'auto', 
                        padding: "8px 20px", 
                        borderRadius: "20px", 
                        border: "none", 
                        // 🌟 使用你 AuthShell 里的核心炫彩渐变，这才是 VOX 的灵魂
                        background: "linear-gradient(90deg, #9381ff, #f865b0)", 
                        color: "#ffffff", // 绝对的白色，保证清晰度
                        cursor: "pointer", 
                        fontWeight: 800, // 字重加粗，一眼即识
                        fontSize: '14px',
                        letterSpacing: '0.5px',
                        // 🌟 强力阴影，让按钮在界面上“浮”起来
                        boxShadow: "0 6px 16px rgba(147, 129, 255, 0.4)",
                        transition: "all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
                        e.currentTarget.style.boxShadow = "0 10px 24px rgba(147, 129, 255, 0.5)";
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = "translateY(0) scale(1)";
                        e.currentTarget.style.boxShadow = "0 6px 16px rgba(147, 129, 255, 0.4)";
                    }}
                >
                    📩 查看申请
                </button>
            </div>


            {/* 🌟 搜索框美化：胶囊式设计 */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "30px" }}>
                <input
                    value={keyword}
                    onChange={e => {
                        setKeyword(e.target.value);
                        setHasSearched(false);
                    }}
                    placeholder="输入用户名或昵称"
                    style={{
                        flex: 1,
                        padding: "12px 20px",
                        borderRadius: "25px", // 胶囊圆角
                        border: "2px solid rgba(147, 129, 255, 0.2)", // 紫色边框
                        outline: "none",
                        fontSize: "14px",
                        transition: "all 0.3s ease"
                    }}
                    onFocus={(e) => e.target.style.border = "2px solid #9381ff"}
                    onBlur={(e) => e.target.style.border = "2px solid rgba(147, 129, 255, 0.2)"}
                />
                <button 
                    onClick={handleSearch} 
                    style={{ 
                        padding: "10px 24px", 
                        borderRadius: "25px", 
                        border: "none", 
                        background: "linear-gradient(135deg, #9381ff, #70d6ff)", // VOX 渐变
                        color: "#fff", 
                        fontWeight: 700,
                        cursor: "pointer",
                        boxShadow: "0 4px 10px rgba(147, 129, 255, 0.3)"
                    }}
                >
                    搜索
                </button>
            </div>
     
            <div>
                {Array.isArray(results) && results.length > 0 ? (
                    results.map(user => (
                        <div key={user.user_id} style={{ 
                            display: "flex", justifyContent: "space-between", alignItems: "center", 
                            padding: "12px 0", borderBottom: "1px solid #f0f0f0" 
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {/* 普通圆形头像，不再有渐变光环 */}
                                {user.avatar_url ? (
                                    <img src={getSafeAvatarUrl(user.avatar_url)} style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover" }} />
                                ) : (
                                    <div style={{ width: 42, height: 42, borderRadius: "50%", backgroundColor: "#1890ff", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold" }}>
                                        {(user.nickname || user.username || "?").slice(-2).toUpperCase()}
                                    </div>
                                )}
                                <div>
                                    <div style={{ fontWeight: 600, color: "#2d2b55" }}>{user.nickname || user.username}</div>
                                    <div style={{ color: "#7b7b99", fontSize: "12px" }}>@{user.username}</div>
                                </div>
                            </div>

                            {/* 状态按钮 - 使用清晰的纯色 */}
                            <div>
                                {user.status === 'accepted' ? (
                                    <span style={{ color: "#a0a0a0", fontSize: "13px" }}>已是好友</span>
                                ) : user.status === 'pending' ? (
                                    <span style={{ color: "#faad14", fontSize: "13px" }}>等待处理</span>
                                ) : (
                                    <button 
                                        onClick={() => handleAddFriend(user.user_id)}
                                        disabled={submittingIds.includes(user.user_id)}
                                        style={{ 
                                            padding: "8px 16px", 
                                            // 🌟 核心：透明背景，只留渐变边框，清爽高级
                                            background: submittingIds.includes(user.user_id) ? "#e2e2ec" : "transparent",
                                            color: submittingIds.includes(user.user_id) ? "#a0a0b8" : "#9381ff",
                                            border: submittingIds.includes(user.user_id) ? "none" : "1.5px solid #9381ff", 
                                            borderRadius: "12px", 
                                            fontWeight: 700,
                                            fontSize: "13px",
                                            cursor: submittingIds.includes(user.user_id) ? "not-allowed" : "pointer",
                                            transition: "all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)"
                                        }}
                                        onMouseEnter={e => {
                                            if (!submittingIds.includes(user.user_id)) {
                                                // 🌟 悬浮时变身 VOX 炫彩渐变
                                                e.currentTarget.style.background = "linear-gradient(135deg, #9381ff, #f865b0)";
                                                e.currentTarget.style.color = "#fff";
                                                e.currentTarget.style.border = "none";
                                                e.currentTarget.style.boxShadow = "0 4px 12px rgba(147, 129, 255, 0.3)";
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (!submittingIds.includes(user.user_id)) {
                                                e.currentTarget.style.background = "transparent";
                                                e.currentTarget.style.color = "#9381ff";
                                                e.currentTarget.style.border = "1.5px solid #9381ff";
                                                e.currentTarget.style.boxShadow = "none";
                                            }
                                        }}
                                    >
                                        {submittingIds.includes(user.user_id) ? "发送中..." : "添加好友"}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                ) : Array.isArray(results) && results.length === 0 && hasSearched ? (
                        <div style = {{ color: "#999", textAlign: "center", marginTop: "20px" }}>
                            {"没有找到相关用户"}
                        </div>
                ) : (
                    <div style = {{ color: "#ccc", textAlign: "center", marginTop: "20px" }}>
                        {"请输入搜索关键词以搜索用户"}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FriendSearch