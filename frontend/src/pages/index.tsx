import { useRouter } from "next/router";
import { useEffect, useState, useRef } from "react";
import { RootState } from "../redux/store";
import { useSelector } from "react-redux";

const WelcomeScreen = () => {
  const router = useRouter();
  const token = useSelector((state: RootState) => state.auth.token);
  const canvasRef = useRef<HTMLCanvasElement>({} as HTMLCanvasElement);

  // 状态控制
  const [showBigChat, setShowBigChat] = useState(true);
  const [chatFlying, setChatFlying] = useState(false);
  const [showSideChat, setShowSideChat] = useState(false);
  const [showVox, setShowVox] = useState(false);
  const [animationEnd, setAnimationEnd] = useState(false);

  // 消息
  const [leftMessages, setLeftMessages] = useState<string[]>([]);
  const [rightMessages, setRightMessages] = useState<string[]>([]);

  const teenMessages = [
    "OMG Vox is so cool!😌",
    "😍 Let's chat fr 😍",
    "This app slaps fr fr",
    "so stoked to be here 🥳",
    "I love this vibe so much",
    "Vro this is amazing!",
    "Yesss let's goooo🚀🚀🚀",
    "What's new w u?",
    "this is pure joy 😆",
    "Vox is the best fr",
    "vibing hard today 🎶",
    "Loving this energy 💓💓",
    "Haha right??",
    "literally have th best time🫂",
  ];

  const leftEmojis = ["👦", "👨", "🧑", "👱‍♂️", "🧔‍♂️"];
  const rightEmojis = ["👧", "👩", "🧑‍🦱", "👱‍♀️", "👩‍🦰"];

  // 已登录跳转
  useEffect(() => {
    if (token) router.replace("/ChatPage");
  }, [token, router]);

  // 中央开场2条消息
  useEffect(() => {
    const msgs = [
      { text: "welcome to Vox!", side: "left" },
      { text: "Nice to meet you", side: "right" },
    ];
    let step = 0;

    const chatTimer = setInterval(() => {
      const item = msgs[step];
      if (item.side === "left") setLeftMessages([item.text]);
      else setRightMessages([item.text]);

      step++;
      if (step >= 2) {
        clearInterval(chatTimer);
        setTimeout(() => {
          setChatFlying(true);
          setTimeout(() => {
            setShowBigChat(false);
            setShowSideChat(true);
            setShowVox(true);
          }, 500);
        }, 1200);
      }
    }, 800);

    return () => clearInterval(chatTimer);
  }, []);

  // 严格 左→右交替，统一间隔，各6条停止
  useEffect(() => {
    if (!showSideChat) return;

    // 初始各1条，还需要各发 5 条
    let count = 0;
    const maxPair = 5; // 左右各再发5条，总共6
    const intervalTime = 1600;

    const interval = setInterval(() => {
      // 成对发送：count偶数=左，奇数=右
      if (count % 2 === 0) {
        setLeftMessages(prev => [...prev, teenMessages[Math.floor(Math.random() * teenMessages.length)]]);
      } else {
        setRightMessages(prev => [...prev, teenMessages[Math.floor(Math.random() * teenMessages.length)]]);
      }

      count++;
      // 左右各5条发完，一共10次，停止
      if (count >= maxPair * 2) {
        clearInterval(interval);
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [showSideChat]);

  // VOX后显示按钮
  useEffect(() => {
    if (!showVox) return;
    const timer = setTimeout(() => setAnimationEnd(true), 1800);
    return () => clearTimeout(timer);
  }, [showVox]);

  // 粒子背景
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles: any[] = [];
    const stars: any[] = [];
    const colors = ["#ff70a6", "#ff9770", "#ffd670", "#70d6ff", "#9381ff", "#f865b0"];

    for (let i = 0; i < Math.floor(window.innerWidth / 8); i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 3 + 1,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: Math.random() * 0.6 + 0.4,
      });
    }

    for (let i = 0; i < 20; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        length: Math.random() * 80 + 40,
        speed: Math.random() * 6 + 3,
        opacity: Math.random() * 0.5 + 0.2,
      });
    }

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach((s) => {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${s.opacity})`;
        ctx.lineWidth = 1.5;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.length, s.y + s.length / 2);
        ctx.stroke();
        s.x += s.speed;
        s.y += s.speed / 2;
        if (s.x > canvas.width) s.x = -s.length;
        if (s.y > canvas.height) s.y = 0;
      });
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.floor(p.opacity * 255).toString(16);
        ctx.fill();
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
      });
      requestAnimationFrame(draw);
    }
    draw();
  }, []);

  // 全局动画
  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
      @keyframes voxBounceAnim {
        0%   { opacity:0; transform: scale(0.4) rotate(-5deg); }
        30%  { opacity:1; transform: scale(1.25) rotate(2deg); }
        60%  { transform: scale(0.95) rotate(-1deg); }
        100% { opacity:1; transform: scale(1) rotate(0); }
      }
      @keyframes lightShine { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
      @keyframes welcomeTypo { 0% { opacity:0; transform: translateY(30px) scale(0.9); } 100% { opacity:1; transform: translateY(0) scale(1); } }
      @keyframes btnFloat { 0% { transform: translateY(0); } 50% { transform: translateY(-4px); } 100% { transform: translateY(0); } }
      @keyframes msgPop { 0% { transform: scale(0.6); opacity:0; } 70% { transform: scale(1.1); } 100% { transform: scale(1); opacity:1; } }
      @keyframes bigMsgAni {
        0% { transform: scale(0.7) rotate(-5deg); opacity:0; }
        60% { transform: scale(1.15) rotate(2deg); opacity:1; }
        100% { transform: scale(1) rotate(0); opacity:1; }
      }
      @keyframes flyToLeft {
        0% { transform: translate(0,0) scale(1); opacity:1; }
        100% { transform: translate(-45vw, -28vh) scale(0.35); opacity:0; }
      }
      @keyframes flyToRight {
        0% { transform: translate(0,0) scale(1); opacity:1; }
        100% { transform: translate(45vw, -25vh) scale(0.35); opacity:0; }
      }
    `;
    document.head.appendChild(styleSheet);
    return () => { document.head.removeChild(styleSheet); };
  }, []);

  return (
    <div style={styles.pageContainer}>
      <canvas ref={canvasRef} style={styles.particleCanvas} />

      {showSideChat && (
        <>
          <div style={styles.leftChatContainer}>
            {leftMessages.map((msg, i) => (
              <div key={i} style={styles.chatRowLeft}>
                <div style={styles.avatar}>{leftEmojis[i % leftEmojis.length]}</div>
                <div style={styles.leftBubble}>{msg}</div>
              </div>
            ))}
          </div>
          <div style={styles.rightChatContainer}>
            {rightMessages.map((msg, i) => (
              <div key={i} style={styles.chatRowRight}>
                <div style={styles.rightBubble}>{msg}</div>
                <div style={styles.avatar}>{rightEmojis[i % rightEmojis.length]}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {showBigChat && (
        <div style={styles.bigChatWrap}>
          {leftMessages.map((msg, i) => (
            <div
              key={i}
              style={{
                ...styles.bigMsgLeft,
                animation: chatFlying ? "flyToLeft 0.7s ease forwards" : "bigMsgAni 0.6s ease forwards",
              }}
            >
              <div style={styles.bigAvatar}>{leftEmojis[i]}</div>
              <div style={styles.bigBubbleLeft}>{msg}</div>
            </div>
          ))}
          {rightMessages.map((msg, i) => (
            <div
              key={i}
              style={{
                ...styles.bigMsgRight,
                animation: chatFlying ? "flyToRight 0.7s ease forwards" : "bigMsgAni 0.6s ease forwards",
              }}
            >
              <div style={styles.bigBubbleRight}>{msg}</div>
              <div style={styles.bigAvatar}>{rightEmojis[i]}</div>
            </div>
          ))}
        </div>
      )}

      {showVox && (
        <div style={styles.titleWrapper}>
          <div style={styles.vox}>VOX</div>
          <div style={styles.welcome}>welcome</div>
        </div>
      )}

      <div
        style={{
          ...styles.buttonWrapper,
          opacity: animationEnd ? 1 : 0,
          transform: animationEnd ? "translateY(0)" : "translateY(40px)",
        }}
      >
        <button style={styles.registerBtn} onClick={() => router.push("/auth/RegistrationScreen")}>
          注册账号
        </button>
        <button style={styles.loginBtn} onClick={() => router.push("/auth/LoginScreen")}>
          立即登录
        </button>
      </div>
    </div>
  );
};

const styles = {
  pageContainer: {
    width: "100vw",
    height: "100vh",
    background: "linear-gradient(135deg, #fdfbfd 0%, #f0f9ff 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: "22vh",
    overflow: "hidden",
    position: "fixed",
    top: 0,
    left: 0,
  },
  particleCanvas: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    zIndex: 1,
    opacity: 0.7,
    pointerEvents: "none",
  },

  bigChatWrap: {
    position: "fixed",
    top: "28vh",
    zIndex: 999,
    display: "flex",
    flexDirection: "column",
    gap: "40px",
    alignItems: "center",
  },
  bigMsgLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  bigMsgRight: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  bigAvatar: {
    fontSize: "78px",
  },
  bigBubbleLeft: {
    padding: "33px 45px",
    borderRadius: "30px",
    backgroundColor: "#e8f0fe",
    fontSize: "48px",
    fontWeight: 500,
    boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
  },
  bigBubbleRight: {
    padding: "33px 45px",
    borderRadius: "30px",
    backgroundColor: "#d1f7ff",
    fontSize: "48px",
    fontWeight: 500,
    boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
  },

  leftChatContainer: {
    position: "fixed",
    left: "3vw",
    top: "calc(10vh + 25px)",
    bottom: "10vh",
    zIndex: 5,
    display: "flex",
    flexDirection: "column",
    gap: "60px",
    overflow: "scroll",
    width: "340px",
	scrollbarWidth: "none",
  	msOverflowStyle: "none",
  	"&::-webkit-scrollbar": {
    display: "none",
  	},
  },
  rightChatContainer: {
    position: "fixed",
    right: "3vw",
    top: "calc(10vh + 85px)",
    bottom: "10vh",
    zIndex: 5,
    display: "flex",
    flexDirection: "column",
    gap: "60px",
    overflow: "scroll",
    alignItems: "flex-end",
    width: "340px",
	scrollbarWidth: "none",
  	msOverflowStyle: "none",
  	"&::-webkit-scrollbar": {
    display: "none",
	},
  },
  chatRowLeft: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    animation: "msgPop 0.4s ease forwards",
  },
  chatRowRight: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    animation: "msgPop 0.4s ease forwards",
  },
  avatar: {
    fontSize: "34px",
    lineHeight: "1",
  },
  leftBubble: {
    maxWidth: "280px",
    padding: "14px 18px",
    borderRadius: "24px",
    backgroundColor: "#e8f0fe",
    fontSize: "19.5px",
    color: "#333",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    lineHeight: "1.4",
  },
  rightBubble: {
    maxWidth: "280px",
    padding: "14px 18px",
    borderRadius: "24px",
    backgroundColor: "#d1f7ff",
    fontSize: "19.5px",
    color: "#333",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    lineHeight: "1.4",
  },

  titleWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    zIndex: 10,
    marginBottom: "6vh",
  },
  vox: {
    fontSize: "210px",
    fontWeight: 900,
    background: "linear-gradient(90deg, #9381ff, #f865b0, #ff9770, #70d6ff, #9381ff)",
    backgroundSize: "400% 100%",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    animation: "voxBounceAnim 1.6s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards, lightShine 8s linear infinite",
    willChange: "transform, opacity",
  },
  welcome: {
    fontSize: "48px",
    fontWeight: 600,
    background: "linear-gradient(90deg, #5b86f7, #ff70a6)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    letterSpacing: "12px",
    marginTop: "8px",
    opacity: 0,
    animation: "welcomeTypo 1.1s ease 0.2s forwards",
  },
  buttonWrapper: {
    display: "flex",
    gap: "36px",
    transition: "all 1.1s cubic-bezier(0.16, 1, 0.3, 1)",
    zIndex: 10,
  },
  registerBtn: {
    padding: "20px 54px",
    fontSize: "20px",
    fontWeight: 600,
    color: "#fff",
    backgroundColor: "#8c81ff",
    border: "none",
    borderRadius: "50px",
    cursor: "pointer",
    transition: "all 0.3s ease",
    boxShadow: "0 8px 20px rgba(140, 129, 255, 0.35)",
    animation: "btnFloat 3s ease-in-out infinite",
  },
  loginBtn: {
    padding: "20px 54px",
    fontSize: "20px",
    fontWeight: 600,
    color: "#fff",
    background: "linear-gradient(90deg, #5b86f7, #3badff)",
    border: "none",
    borderRadius: "50px",
    cursor: "pointer",
    transition: "all 0.3s ease",
    boxShadow: "0 8px 20px rgba(91, 134, 247, 0.35)",
    animation: "btnFloat 3s ease-in-out infinite 0.4s",
  },
} as const;

export default WelcomeScreen;