import { useState } from "react";
import type { ComputeSummary, NodeCompute } from "../utils/computeEstimator";

type Props = {
    summary: ComputeSummary;
    onSelect: (node: NodeCompute) => void;
    onHover: (nodeId: string | null) => void;
    onClose: () => void;
};

const formatCount = (value: number) => {
    if (!Number.isFinite(value)) return "—";
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return `${Math.round(value)}`;
};

const formatFlops = (value: number) => `${formatCount(value)} FLOPs`;
const formatParams = (value: number) => `${formatCount(value)} params`;

const sortByCompute = (nodes: NodeCompute[]) =>
    [...nodes].sort((a, b) => (b.flops + b.params) - (a.flops + a.params));
const isNonZeroCost = (node: NodeCompute) => node.params > 0 || node.flops > 0;

export default function ComputePanel({ summary, onSelect, onHover, onClose }: Props) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const topNodes = sortByCompute(summary.nodes.filter(isNonZeroCost)).slice(0, 8);
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
                <span style={{ color: "#f8fafc", fontWeight: 700 }}>Compute Analysis</span>
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
            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
                <div style={{ display: "flex", gap: 12 }}>
                    <div
                        style={{
                            flex: 1,
                            padding: 10,
                            borderRadius: 8,
                            border: "1px solid #1f2937",
                            background: "#111827",
                            color: "#e5e7eb",
                        }}
                    >
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Total Params</div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{formatParams(summary.totalParams)}</div>
                    </div>
                    <div
                        style={{
                            flex: 1,
                            padding: 10,
                            borderRadius: 8,
                            border: "1px solid #1f2937",
                            background: "#0b1f2a",
                            color: "#e5e7eb",
                        }}
                    >
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>Total FLOPs</div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{formatFlops(summary.totalFlops)}</div>
                    </div>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Top Contributors
                </div>
                {topNodes.length === 0 ? (
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
                        No compute data available.
                    </div>
                ) : (
                    topNodes.map(node => {
                        const paramPct = summary.totalParams ? (node.params / summary.totalParams) * 100 : 0;
                        const flopsPct = summary.totalFlops ? (node.flops / summary.totalFlops) * 100 : 0;
                        return (
                            <button
                                key={node.nodeId}
                                onClick={() => onSelect(node)}
                                style={{
                                    textAlign: "left",
                                    border: node.nodeId === hoveredId ? "1px solid #2563eb" : "1px solid #1f2937",
                                    background: node.nodeId === hoveredId ? "#1f2937" : "#14161c",
                                    borderRadius: 8,
                                    padding: 8,
                                    color: "#e5e7eb",
                                    cursor: "pointer",
                                    boxShadow: node.nodeId === hoveredId ? "0 0 0 1px rgba(37,99,235,0.3)" : "none",
                                }}
                                onMouseEnter={() => {
                                    setHoveredId(node.nodeId);
                                    onHover(node.nodeId);
                                }}
                                onMouseLeave={() => {
                                    setHoveredId(null);
                                    onHover(null);
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                    <span style={{ fontWeight: 600 }}>{node.label}</span>
                                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{node.type}</span>
                                </div>
                                <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 12 }}>
                                    <span>{formatParams(node.params)}</span>
                                    <span style={{ color: "#64748b" }}>{paramPct ? `${paramPct.toFixed(1)}%` : "—"}</span>
                                    <span style={{ marginLeft: "auto" }}>{formatFlops(node.flops)}</span>
                                    <span style={{ color: "#64748b" }}>{flopsPct ? `${flopsPct.toFixed(1)}%` : "—"}</span>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
