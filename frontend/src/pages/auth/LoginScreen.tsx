// 小作业的登陆界面, 完全没改动
import { useState } from "react";
import { BACKEND_URL, FAILURE_PREFIX, LOGIN_FAILED, LOGIN_SUCCESS_PREFIX } from "../../constants/string";
import { useRouter } from "next/router";
import { setPassword as setAuthPassword, setProfile, setToken } from "../../redux/auth";
import { useDispatch } from "react-redux";
import { request } from "../../utils/network";
import { checkPassword } from "../../utils/validation";
import localforage from "localforage";
import { AuthShell } from "../../components/auth/AuthShell";
import { translateError } from "../../utils/errorHandler";

const LoginScreen = () => {
    const [userName, setUserName] = useState("");
    const [password, setPassword] = useState("");

    const router = useRouter();
    const dispatch = useDispatch();

    const login = async() => {
        if (userName.length < 3 || userName.length > 32) {
            alert("用户名长度均在 3-32 字符之间");
            return;
        }
        if (!/^\w+$/.test(userName)) {
            alert("用户名只包含字母、数字和下划线");
            return;
        }
        const passwordCheckResult = checkPassword(password);
        if (passwordCheckResult === 1) {
            alert("密码长度至少为 6 字符");
            return;
        }
        if (passwordCheckResult === 2) {
            alert("密码必须同时包含字母和数字");
            return;
        }
        try{
            // 使用network.ts中的request函数进行登录请求, needAuth设置为false,因为登录请求不需要携带JWT
            const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: userName,
                    password
                })
            });

            const data = await res.json();

            if(res.status === 200){
                const finalToken = data.access_token || data.token;
                if(!finalToken){
                    throw new Error(LOGIN_FAILED);
                }

                dispatch(setToken(finalToken));

                // 登录成功后立即获取当前用户完整信息并写入 Redux
                const me = await request(`${BACKEND_URL}/api/auth/me`, "GET", true);
                const processedAvatarUrl = me?.avatar_url ? `/api${me.avatar_url}` : "";
                dispatch(setProfile({ ...me, avatar_url: processedAvatarUrl }));
                dispatch(setAuthPassword(password));

                await localforage.setItem("token", finalToken);
                await localforage.setItem("username", me.username);
                await localforage.setItem("password", password);
                await localforage.setItem("avatar", processedAvatarUrl);

                alert(LOGIN_SUCCESS_PREFIX + (me.username));
                router.push('/'); // 跳转到聊天主界面
            }else if(res.status === 401){
                // 401状态码表示认证失败，通常是用户名或密码错误
                alert(`登录失败：${data.detail || "用户名或密码错误"}`);
            }else{
                alert(`登录失败：${data.detail || LOGIN_FAILED}`);
            }
        } catch(err : any){
            alert(FAILURE_PREFIX + (translateError(err, LOGIN_FAILED)));
        }
    };

    // 简单的登录表单，输入用户名和密码，点击登录按钮触发login函数
    return (
        <AuthShell
            title="欢迎回来"
            subtitle="登录后继续你的 VOX 时刻"
            emojiRow={["💬", "✨", "🎧", "🚀", "🌙", "🫶"]}
        >
            <input
                type="text"
                placeholder="User name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                style={styles.input}
            />
            <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
            />
            <button
                onClick={login}
                disabled={userName === "" || password === ""}
                style={styles.primaryButton}
            >
                登录
            </button>
            <div style={styles.helperText}>使用你的账号开启聊天之旅</div>
        </AuthShell>
    );
};

const styles: Record<string, React.CSSProperties> = {
    input: {
        width: "100%",
        borderRadius: "14px",
        border: "1px solid #e7e7f5",
        padding: "12px 14px",
        fontSize: "14px",
        backgroundColor: "#fff",
        outline: "none",
        boxShadow: "0 6px 18px rgba(147,129,255,0.12)",
        transition: "border 0.2s ease, box-shadow 0.2s ease",
    },
    primaryButton: {
        width: "100%",
        marginTop: "6px",
        borderRadius: "14px",
        border: "none",
        padding: "12px",
        fontSize: "15px",
        fontWeight: 600,
        color: "#fff",
        background: "linear-gradient(90deg, #5b86f7, #ff70a6)",
        cursor: "pointer",
        boxShadow: "0 12px 24px rgba(91,134,247,0.28)",
    },
    helperText: {
        textAlign: "center",
        fontSize: "12px",
        color: "#8a8aa6",
        letterSpacing: "1px",
    },
};

export default LoginScreen;
