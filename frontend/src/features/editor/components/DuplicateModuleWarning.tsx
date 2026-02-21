type DuplicateModuleWarningProps = {
    onClose: () => void;
}

export function DuplicateModuleWarning({ onClose }: DuplicateModuleWarningProps) {
    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "#1f2937",
                    color: "#e5e7eb",
                    padding: "20px 22px",
                    borderRadius: "12px",
                    width: "360px",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
                    animation: "popupFade 0.2s ease-out",
                    border: "1px solid #374151",
                    position: "relative"
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: "4px",
                        background: "linear-gradient(90deg, #ef4444, #dc2626)",
                        borderTopLeftRadius: "12px",
                        borderTopRightRadius: "12px"
                    }}
                />

                <div style={{ fontWeight: 600, fontSize: "16px", marginBottom: "6px" }}>
                    Duplicate Module Name
                </div>

                <div style={{ fontSize: "14px", lineHeight: 1.5, color: "#9ca3af" }}>
                    A module with this name already exists. Please choose a different name to continue.
                </div>

                <div
                    style={{
                        marginTop: "16px",
                        fontSize: "12px",
                        color: "#6b7280"
                    }}
                >
                    Click outside to dismiss
                </div>
            </div>

            <style>
                {`
                    @keyframes popupFade {
                        from {
                            opacity: 0;
                            transform: scale(0.96);
                        }
                        to {
                            opacity: 1;
                            transform: scale(1);
                        }
                    }
                `}
            </style>
        </div>
    );
}
