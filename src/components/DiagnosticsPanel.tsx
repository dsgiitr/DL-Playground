import type { ShapeFailure } from "../utils/shape_verifier";

type Props = {
    failures: ShapeFailure[];
    onSelect: (failure: ShapeFailure) => void;
    onClose: () => void;
};

export default function DiagnosticsPanel({ failures, onSelect, onClose }: Props) {
    return (
        <div
            style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 360,
                maxHeight: "70vh",
                background: "#0f1115",
                border: "1px solid #27272a",
                borderRadius: 10,
                boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                zIndex: 6,
            }}
        >
            <div
                style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid #27272a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#111318",
                }}
            >
                <span style={{ color: "#f8fafc", fontWeight: 700 }}>Diagnostics</span>
                <button
                    onClick={onClose}
                    style={{
                        padding: "2px 6px",
                        borderRadius: 6,
                        border: "1px solid #3f3f46",
                        background: "#1f1f1f",
                        color: "#e6edf3",
                        cursor: "pointer",
                        fontSize: 12,
                    }}
                >
                    Close
                </button>
            </div>
            <div style={{ padding: 10, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {failures.length === 0 ? (
                    <div
                        style={{
                            padding: "12px 10px",
                            border: "1px dashed #334155",
                            borderRadius: 8,
                            color: "#94a3b8",
                            textAlign: "center",
                            fontSize: 12,
                        }}
                    >
                        No issues found.
                    </div>
                ) : (
                    failures.map((failure, idx) => {
                        const title = failure.label || failure.nodeType || failure.nodeId;
                        const inputs =
                            failure.inputShapes && failure.inputShapes.length
                                ? failure.inputShapes.map(s => `[${s.join(",")}]`).join(", ")
                                : "—";
                        return (
                            <button
                                key={`${failure.nodeId}-${idx}`}
                                onClick={() => onSelect(failure)}
                                style={{
                                    textAlign: "left",
                                    border: "1px solid #2d2d2d",
                                    background: "#14161c",
                                    borderRadius: 8,
                                    padding: 8,
                                    color: "#e5e7eb",
                                    cursor: "pointer",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ color: "#f97316", fontWeight: 700 }}>{idx + 1}</span>
                                    <span style={{ fontWeight: 600 }}>{title}</span>
                                </div>
                                <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 4 }}>
                                    {failure.error}
                                </div>
                                <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 6 }}>
                                    Inputs: {inputs}
                                </div>
                                {failure.upstream && failure.upstream.length > 0 && (
                                    <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
                                        From: {failure.upstream.join(", ")}
                                    </div>
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
