import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import localforage from "localforage";
import { RootState } from "../../redux/store";
import { request } from "../../utils/network";
import { BACKEND_URL } from "../../constants/string";
import { setProfile } from "../../redux/auth";
import { checkEmail, checkPhone, checkPassword } from "../../utils/validation";

const ProfilePage: React.FC = () => {
    const router = useRouter();
    const dispatch = useDispatch();
    const userId = useSelector((state: RootState) => state.auth.user_id);
    const userName = useSelector((state: RootState) => state.auth.username);
    const password = useSelector((state: RootState) => state.auth.password);
    const nickName = useSelector((state: RootState) => state.auth.nickname);
    const email = useSelector((state: RootState) => state.auth.email);
    const phone = useSelector((state: RootState) => state.auth.phone);
    const avatarUrl = useSelector((state: RootState) => state.auth.avatar_url);
    const createdAt = useSelector((state: RootState) => state.auth.created_at);

    const [modalOpen, setModalOpen] = useState(false);
    const [formUsername, setFormUsername] = useState("");
    const [formNickname, setFormNickname] = useState("");
    const [formEmail, setFormEmail] = useState("");
    const [formPhone, setFormPhone] = useState("");
    const [formPassword, setFormPassword] = useState("");
    const [formOldPassword, setFormOldPassword] = useState("");
    const [avatarFile, setAvatarFile] = useState<File | undefined>(undefined);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [avatarLoadError, setAvatarLoadError] = useState(false);

    const displayAvatarUrl = avatarUrl?.trim() || "";
    const shouldShowAvatar = Boolean(displayAvatarUrl) && !avatarLoadError;

    useEffect(() => {
        setAvatarLoadError(false);
    }, [displayAvatarUrl]);

    // 设置初始值为当前用户信息，打开编辑模态框
    const openEditModal = () => {
        setFormUsername(userName);
        setFormNickname(nickName);
        setFormEmail(email);
        setFormPhone(phone);
        setFormPassword(password);
        setFormOldPassword("");
        setModalOpen(true);
    };

    // 提交资料更新请求，成功后更新Redux中的用户信息并关闭
    const submitProfileUpdate = async () => {
        if (!formUsername || !formPassword || !formEmail || !formNickname || !formPhone) {
            alert("请完整填写所有信息");
            return;
        }
        if (formUsername.length < 3 || formUsername.length > 32) {
            alert("用户名长度应当在 3-32 字符之间");
            return;
        }
        if (!/^\w+$/.test(formUsername)) {
            alert("用户名只包含字母、数字和下划线");
            return;
        }
        const passwordCheckResult = checkPassword(formPassword);
        if (passwordCheckResult === 1) {
            alert("密码长度至少为 6 字符");
            return;
        }
        if (passwordCheckResult === 2) {
            alert("密码必须同时包含字母和数字");
            return;
        }
        if (!checkEmail(formEmail)) {
            alert("邮箱格式不正确，请输入合法邮箱地址");
            return;
        }
        if (!checkPhone(formPhone)) {
            alert("电话格式不正确, 请输入合法电话号码");
            return;
        }
        if (formNickname.length > 32) {
            alert("昵称长度不能超过 32 字符");
            return;
        }
        if (!formOldPassword) {
            alert("请输入原密码以验证身份");
            return;
        }
        try {
            await request(`${BACKEND_URL}/api/auth/profile`, "PUT", true, {
                username: formUsername,
                password: formPassword,
                email: formEmail,
                phone: formPhone,
                nickname: formNickname,
                avatar_url: avatarUrl,
                current_password: formOldPassword,
            });
            
            // 更新Redux中的用户信息
            dispatch(
                setProfile({
                    user_id: userId,
                    username: formUsername,
                    password: formPassword,
                    nickname: formNickname,
                    email: formEmail,
                    phone: formPhone,
                    avatar_url: avatarUrl,
                    created_at: createdAt,
                })
            );

            await localforage.setItem("password", formPassword);

            setModalOpen(false);
            alert("资料更新成功");
        } catch (err: any) {
            alert(err?.message || "资料更新失败");
        }
    };

    const uploadAvatar = async () => {
        if (!avatarFile) {
            alert("请选择图片文件");
            return;
        }
        try {
            setAvatarUploading(true);
            const formData = new FormData();
            formData.append("file", avatarFile);

            const res = await request(`${BACKEND_URL}/api/auth/avatar`, "POST", true, formData);
            const newAvatarUrl = res?.avatar_url;
            if (!newAvatarUrl) {
                alert("上传成功，但后端未返回头像地址");
                return;
            }

            const processedAvatarUrl = `/api${newAvatarUrl}`;

            dispatch(
                setProfile({
                    user_id: userId,
                    username: userName,
                    password,
                    nickname: nickName,
                    email,
                    phone,
                    avatar_url: processedAvatarUrl,
                    created_at: createdAt,
                })
            );
            setAvatarFile(undefined);
            alert("头像上传成功");
        } catch (err: any) {
            alert(err?.message || "头像上传失败");
        } finally {
            setAvatarUploading(false);
        }
    };

    return (
        <div style={{ padding: 24, fontFamily: "sans-serif" }}>
            <button
                onClick={() => router.back()}
                style={{
                    width: "200px",
                    padding: "10px 14px",
                    backgroundColor: "#1d2a9cff",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "15px",
                    fontWeight: "600",
                }}
            >
                返回
            </button>
            <div style={{ maxWidth: 720, margin: "0 auto", backgroundColor: "#fff", padding: 20, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                <h2>个人资料</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    {shouldShowAvatar ? (
                        <img
                            src={displayAvatarUrl}
                            alt="avatar"
                            style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }}
                            onError={() => setAvatarLoadError(true)}
                        />
                    ) : (
                        <div style={{ width: 72, height: 72, borderRadius: "50%", backgroundColor: "#fcbc32ff", color: "#4e4e4efb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700 }}>
                            {userName ? userName.slice(-2).toUpperCase() : "U"}
                        </div>
                    )}
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{nickName || "昵称"}</div>
                        <div style={{ fontSize: 15, color: "#666" }}>{"@" + (userName || "用户名")}</div>
                    </div>
                    <button
                        onClick={openEditModal}
                        style={{
                            marginLeft: "auto",
                            padding: "6px 12px",
                            backgroundColor: "#1890ff",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 14,
                        }}
                    >
                        编辑资料
                    </button>
                </div>

                <div style={{ marginTop: 18, borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, padding: "10px 0", borderBottom: "1px solid #f7f7f7" }}>
                        <div style={{ color: "#666", fontSize: 17 }}>用户名</div>
                        <div style={{ color: "#222", fontSize: 17 }}>{userName}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, padding: "10px 0", borderBottom: "1px solid #f7f7f7" }}>
                        <div style={{ color: "#666", fontSize: 17 }}>昵称</div>
                        <div style={{ color: "#222", fontSize: 17 }}>{nickName}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, padding: "10px 0", borderBottom: "1px solid #f7f7f7" }}>
                        <div style={{ color: "#666", fontSize: 17 }}>邮箱</div>
                        <div style={{ color: "#222", fontSize: 17 }}>{email}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, padding: "10px 0" }}>
                        <div style={{ color: "#666", fontSize: 17 }}>手机号</div>
                        <div style={{ color: "#222", fontSize: 17 }}>{phone}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, padding: "10px 0" }}>
                        <div style={{ color: "#666", fontSize: 17 }}>密码</div>
                        <div style={{ color: "#222", fontSize: 17 }}>{password ? "●".repeat(password.length) : ""}</div>
                    </div>
                </div>
            </div>

            {modalOpen ? (
                <div
                    onClick={() => setModalOpen(false)}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0, 0, 0, 0.35)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 560,
                            maxWidth: "94%",
                            background: "#fff",
                            borderRadius: 10,
                            padding: 20,
                            boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>编辑资料</div>
                            <button
                                type="button"
                                onClick={submitProfileUpdate}
                                style={{
                                    padding: "8px 14px",
                                    borderRadius: 6,
                                    border: "none",
                                    background: "#1890ff",
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                }}
                            >
                                提交修改
                            </button>
                        </div>

                        <div style={{ display: "grid", gap: 10 }}>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 13, color: "#555" }}>头像上传</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => setAvatarFile(e.target.files?.[0] || undefined)}
                                    />
                                    <button
                                        type="button"
                                        onClick={uploadAvatar}
                                        disabled={avatarUploading}
                                        style={{
                                            padding: "8px 12px",
                                            borderRadius: 6,
                                            border: "none",
                                            background: avatarUploading ? "#9ac5ff" : "#4f8cff",
                                            color: "white",
                                            cursor: avatarUploading ? "not-allowed" : "pointer",
                                            fontWeight: 600,
                                        }}
                                    >
                                        {avatarUploading ? "上传中..." : "上传头像"}
                                    </button>
                                </div>
                                <span style={{ fontSize: 12, color: "#888" }}>上传后会立即更新头像</span>
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 13, color: "#555" }}>用户名</span>
                                <input value={formUsername} onChange={(e) => setFormUsername(e.target.value)} placeholder="请输入用户名" style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e6e6e6" }} />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 13, color: "#555" }}>昵称</span>
                                <input value={formNickname} onChange={(e) => setFormNickname(e.target.value)} placeholder="请输入昵称" style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e6e6e6" }} />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 13, color: "#555" }}>邮箱</span>
                                <input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="请输入邮箱" style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e6e6e6" }} />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 13, color: "#555" }}>手机号</span>
                                <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="请输入手机号" style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e6e6e6" }} />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 13, color: "#555" }}>密码</span>
                                <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="请输入密码" style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e6e6e6" }} />
                            </label>

                            <div style={{ borderTop: "1px solid #eeeeee", margin: "4px 0" }} />

                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 13, color: "#555" }}>原密码验证</span>
                                <input type="password" value={formOldPassword} onChange={(e) => setFormOldPassword(e.target.value)} placeholder="输入原密码以验证身份" style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #e6e6e6" }} />
                            </label>
                        </div>
                    </div>
                </div>
            ) : undefined}
        </div>
    );
};

export default ProfilePage;
