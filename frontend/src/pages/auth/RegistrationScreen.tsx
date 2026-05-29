import { useState } from "react";
import { BACKEND_URL, REGISTER_SUCCESS_PREFIX, REGISTER_FAILED ,FAILURE_PREFIX} from "../../constants/string";
import { useRouter } from "next/router";
import { setName } from "../../redux/auth";
import { useDispatch } from "react-redux";
import { checkEmail, checkPhone, checkPassword } from "../../utils/validation";
import { AuthShell } from "../../components/auth/AuthShell";
import { translateError } from "../../utils/errorHandler";

const RegistrationScreen = () => {
    const [userName, setUserName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [nickname, setNickname] = useState("");
    // const [userId, setUserId] = useState(""); // 没用，先留着

    const router = useRouter();
    const dispatch = useDispatch();

    const registration = () => {
        const emailValue = email.trim();
        const phoneValue = phone.trim();

        // 前端验证输入
        if (!userName || !password || !email || !nickname || !phone) {
            alert("请完整填写所有信息");
            return;
        }
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
        if (password !== confirmPassword) {
            alert("两次输入的密码不一致，请重新输入");
            return;
        }
        if (!checkEmail(emailValue)) {
            alert("邮箱格式不正确，请输入合法邮箱地址");
            return;
        }
        if (!checkPhone(phoneValue)) {
            alert("电话格式不正确, 请输入合法电话号码");
            return;
        }
        if (nickname.length > 32) {
            alert("昵称长度不能超过 32 字符");
            return;
        }

        // 发送注册请求
        fetch(`${BACKEND_URL}/api/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json", 
            },
            body: JSON.stringify({
                username: userName, 
                password,
                email: emailValue,
                nickname,
                phone: phoneValue, 
            }),
        })
        .then(async (res) => {
            // 先获取原始响应数据
            const data = await res.json();
            
            // 处理不同状态码
            if (res.status === 201) {
                // 注册成功
                dispatch(setName(data.username));  
                alert(REGISTER_SUCCESS_PREFIX + data.username);
                router.push("/"); // 跳首页
            } else if (res.status === 422 || res.status === 400) {
                // 400 可能是字符串 detail；422 常见是数组 detail
                const detail = data?.detail;
                let errorMsg = "输入格式错误";
                if (Array.isArray(detail)) { // 处理400
                    errorMsg = detail.map((d: any) => d?.msg ?? String(d)).join(", ");
                } else if (typeof detail === "string") { // 处理422
                    errorMsg = detail;
                }
                alert(`注册失败：${errorMsg}`);
            } else {
                // 其他错误
                alert(REGISTER_FAILED);
            }
            return data;
        })
        .catch((err) => {
            // alert(FAILURE_PREFIX + err.message);
            alert(FAILURE_PREFIX + translateError(err, REGISTER_FAILED));
            console.error("注册请求异常：", err);
        });
    };

    return (
        <AuthShell
            title="注册你的 VOX"
            subtitle="填写信息，开启专属聊天空间"
            emojiRow={["🎉", "🧩", "🌟", "🫧", "🪄", "💜"]}
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
            <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={styles.input}
            />
            <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
            />
            <input
                type="text"
                placeholder="Nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={styles.input}
            />
            <input
                type="text"
                placeholder="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={styles.input}
            />
            <button
                onClick={registration}
                disabled={userName === "" || password === "" || confirmPassword === "" || email === "" || nickname === "" || phone === ""}
                style={styles.primaryButton}
            >
                注册
            </button>
            <div style={styles.helperText}>加入 VOX，和好友一起畅聊</div>
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

export default RegistrationScreen;
