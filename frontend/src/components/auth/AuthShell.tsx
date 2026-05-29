import React from "react";

interface AuthShellProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    emojiRow?: string[];
}

export const AuthShell: React.FC<AuthShellProps> = ({ title, subtitle, children, emojiRow }) => {
    const emojis = emojiRow ?? ["✨", "💬", "🎧", "🪐", "🔥", "💫", "🎈"];

    return (
        <div style={styles.pageContainer}>
            <style>{css}</style>
            <div style={styles.contentLayer}>
                <div style={styles.logoWrap}>
                    <div style={styles.vox}>VOX</div>
                    <div style={styles.welcome}>welcome</div>
                </div>

                <div style={styles.card}>
                    <div style={styles.cardHeader}>
                        <div style={styles.cardTitle}>{title}</div>
                        {subtitle ? <div style={styles.cardSubtitle}>{subtitle}</div> : undefined}
                    </div>
                    <div style={styles.cardBody}>{children}</div>
                    <div style={styles.emojiRow}>
                        {emojis.map((emoji, index) => (
                            <span key={`emoji-${index}`} style={styles.emoji}>
                                {emoji}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const css = `
@keyframes authFloat {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
    100% { transform: translateY(0px); }
}
@keyframes authGlow {
    0% { box-shadow: 0 0 0 rgba(255,255,255,0.2); }
    50% { box-shadow: 0 0 24px rgba(255,255,255,0.35); }
    100% { box-shadow: 0 0 0 rgba(255,255,255,0.2); }
}
@keyframes authTitleFloat {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
    100% { transform: translateY(0px); }
}
`;

const styles: Record<string, React.CSSProperties> = {
    pageContainer: {
        width: "100vw",
        height: "100vh",
        background: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "fixed",
        top: 0,
        left: 0,
        overflow: "hidden",
    },
    contentLayer: {
        position: "relative",
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "22px",
        padding: "24px",
        width: "100%",
        maxWidth: "520px",
        boxSizing: "border-box",
    },
    logoWrap: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        animation: "authTitleFloat 5s ease-in-out infinite",
    },
    vox: {
        fontSize: "86px",
        fontWeight: 900,
        background: "linear-gradient(90deg, #9381ff, #f865b0, #ff9770, #70d6ff, #9381ff)",
        backgroundSize: "400% 100%",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
        animation: "authGlow 6s ease-in-out infinite",
        letterSpacing: "4px",
    },
    welcome: {
        fontSize: "18px",
        fontWeight: 600,
        background: "linear-gradient(90deg, #5b86f7, #ff70a6)",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
        letterSpacing: "6px",
        textTransform: "uppercase",
        animation: "authTitleFloat 4.5s ease-in-out infinite",
    },
    card: {
        width: "100%",
        backgroundColor: "rgba(255,255,255,0.85)",
        borderRadius: "22px",
        padding: "32px",
        boxShadow: "0 20px 50px rgba(147,129,255,0.18)",
        border: "1px solid rgba(255,255,255,0.7)",
        backdropFilter: "blur(8px)",
        animation: "authFloat 6s ease-in-out infinite",
    },
    cardHeader: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        marginBottom: "22px",
        textAlign: "center",
    },
    cardTitle: {
        fontSize: "22px",
        fontWeight: 700,
        color: "#2d2b55",
    },
    cardSubtitle: {
        fontSize: "13px",
        color: "#7b7b99",
        letterSpacing: "1px",
    },
    cardBody: {
        display: "flex",
        flexDirection: "column",
        gap: "14px",
    },
    emojiRow: {
        marginTop: "24px",
        display: "flex",
        justifyContent: "center",
        gap: "12px",
        flexWrap: "wrap",
        fontSize: "18px",
    },
    emoji: {
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.12))",
    },
};
