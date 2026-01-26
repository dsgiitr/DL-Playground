type SaveCopyModalProps = {
    onClose: () => void;
    onSave: () => void;
    pendingName: string;
    setPendingName: (val: string) => void;
}

export function SaveCopyModal({ onClose, onSave, pendingName, setPendingName }: SaveCopyModalProps) {
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 70,
                padding: 16,
            }}
        >
            <div
                style={{
                    background: "#0f1115",
                    border: "1px solid #222",
                    borderRadius: 10,
                    width: 360,
                    padding: 16,
                    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#e6edf3", fontWeight: 700 }}>Copy Module</span>
                    <button
                        onClick={onClose}
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "#888",
                            cursor: "pointer",
                            fontSize: 18,
                            lineHeight: 1,
                        }}
                        title="Close"
                    >
                        ×
                    </button>
                </div>
                <label style={{ color: "#cbd5e1", fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
                    Copy Module name
                    <input
                        autoFocus
                        value={pendingName}
                        onChange={e => setPendingName(e.target.value)}
                        style={{
                            background: "#111",
                            border: "1px solid #333",
                            borderRadius: 6,
                            padding: "8px 10px",
                            color: "#e6edf3",
                            fontSize: 14,
                        }}
                    />
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: "8px 12px",
                            background: "#333",
                            color: "#e6edf3",
                            border: "1px solid #444",
                            borderRadius: 6,
                            cursor: "pointer",
                        }}
                    >
                        Close
                    </button>
                    <button
                        onClick={onSave}
                        style={{
                            padding: "8px 12px",
                            background: "#1f8ecd",
                            color: "#fff",
                            border: "1px solid #1f8ecd",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontWeight: 600,
                        }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
