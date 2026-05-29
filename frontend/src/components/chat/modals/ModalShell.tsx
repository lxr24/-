import React from "react";

interface ModalShellProps {
    open: boolean;
    title: string;
    width?: string | number;
    height?: string | number;
    onClose: () => void;
    children: React.ReactNode;
}

const ModalShell: React.FC<ModalShellProps> = ({ open, title, width = "60vw", height = "80vh", onClose, children }) => {
    if (!open) return undefined;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width,
                    height,
                    background: "#fff",
                    borderRadius: 16,
                    padding: 20,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}
                    >
                        ✕
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
};

export default ModalShell;
