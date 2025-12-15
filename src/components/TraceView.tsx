import { useMemo, useEffect } from "react";
import type { TraceEntry, TraceResponse } from "../types/trace";
import { useState, useRef, useCallback } from "react";

function SvgViewer({ svgBase64 }: { svgBase64: string }) {
    const svg = useMemo(() => atob(svgBase64), [svgBase64]);
    const [scale, setScale] = useState(1);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const onWheel = useCallback((e: React.WheelEvent) => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale(prev => {
            const next = Math.min(3, Math.max(0.4, prev + delta));
            return Number(next.toFixed(2));
        });
    }, []);

    const resetZoom = () => setScale(1);
    const zoomIn = () => setScale(prev => Math.min(3, Number((prev + 0.1).toFixed(2))));
    const zoomOut = () => setScale(prev => Math.max(0.4, Number((prev - 0.1).toFixed(2))));

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ padding: "6px 8px", display: "flex", gap: 6, alignItems: "center", color: "#cbd5e1", fontSize: 12 }}>
                <span>Graph</span>
                <button onClick={zoomOut} style={{ padding: "2px 6px", fontSize: 11 }}>-</button>
                <span style={{ minWidth: 40, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
                <button onClick={zoomIn} style={{ padding: "2px 6px", fontSize: 11 }}>+</button>
                <button onClick={resetZoom} style={{ padding: "2px 6px", fontSize: 11 }}>Reset</button>
            </div>
            <div
                ref={containerRef}
                onWheel={onWheel}
                style={{
                    flex: 1,
                    overflow: "auto",
                    background: "#0b0d10",
                    borderTop: "1px solid #1f2937",
                    position: "relative",
                }}
            >
                <div
                    style={{
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                        width: "fit-content",
                        height: "fit-content",
                    }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
            </div>
        </div>
    );
}

type Props = {
    trace: TraceResponse | null;
    loading: boolean;
    error?: string | null;
    onClose: () => void;
    onSelect: (nodeIds: string[]) => void;
};

export default function TraceView({ trace, loading, error, onClose, onSelect }: Props) {
    const entries = trace?.entries ?? [];
    const warnings = trace?.warnings ?? [];
    const svg = trace?.svgBase64;
    const summary = trace?.summaryText;

    useEffect(() => {
        if (!svg && trace) {
            // Developer-facing log to help debug missing graphs
            console.warn("TorchLens trace: svgBase64 missing on response", trace);
        }
    }, [svg, trace]);

    const parsedSummary = useMemo(() => {
        if (!summary) return { pairs: [], rest: summary };
        const lines = summary.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        const pairs: Array<{ key: string; value: string }> = [];
        const restLines: string[] = [];
        lines.forEach(line => {
            const idx = line.indexOf(":");
            if (idx > 0 && idx < line.length - 1 && !line.startsWith("-")) {
                const key = line.slice(0, idx).trim();
                const value = line.slice(idx + 1).trim();
                pairs.push({ key, value });
            } else {
                restLines.push(line);
            }
        });
        return { pairs, rest: restLines.join("\n") };
    }, [summary]);

    const rows = useMemo(() => entries, [entries]);

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 30,
                padding: 20,
            }}
        >
            <div
                style={{
                    background: "#0f1115",
                    border: "1px solid #222",
                    borderRadius: 10,
                    width: "90vw",
                    height: "90vh",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
                }}
            >
                <div
                    style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid #222",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        justifyContent: "space-between",
                    }}
                >
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ color: "#e6edf3", fontWeight: 700 }}>TorchLens Trace</span>
                        {loading && <span style={{ color: "#9ca3af" }}>running…</span>}
                        {warnings.map((w, idx) => (
                            <span key={idx} style={{ color: "#facc15", fontSize: 12 }}>{w}</span>
                        ))}
                        {error && <span style={{ color: "#f87171", fontSize: 12 }}>{error}</span>}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "1px solid #444",
                            background: "#333",
                            color: "#fff",
                            cursor: "pointer",
                        }}
                    >
                        Close
                    </button>
                </div>
                <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "row" }}>
                    <div style={{ flex: "0 0 55%", overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", color: "#e6edf3", fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: "#111827" }}>
                                    <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #1f2937" }}>Scope</th>
                                    <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #1f2937" }}>Op</th>
                                    <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #1f2937" }}>Input</th>
                                    <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #1f2937" }}>Output</th>
                                    <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #1f2937" }}>Dtype</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((entry: TraceEntry) => (
                                    <tr
                                        key={entry.id}
                                        onClick={() => onSelect(entry.nodeIds || [])}
                                        style={{ cursor: "pointer", background: "#0b0d10" }}
                                    >
                                        <td style={{ padding: "8px", borderBottom: "1px solid #1f2937" }}>{entry.scope}</td>
                                        <td style={{ padding: "8px", borderBottom: "1px solid #1f2937" }}>{entry.op}</td>
                                        <td style={{ padding: "8px", borderBottom: "1px solid #1f2937" }}>{entry.inputShape ?? ""}</td>
                                        <td style={{ padding: "8px", borderBottom: "1px solid #1f2937" }}>{entry.outputShape ?? ""}</td>
                                        <td style={{ padding: "8px", borderBottom: "1px solid #1f2937" }}>{entry.dtype ?? ""}</td>
                                    </tr>
                                ))}
                                {!rows.length && !loading && (
                                    <tr>
                                        <td colSpan={5} style={{ padding: "12px", textAlign: "center", color: "#9ca3af" }}>
                                            No trace data
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        {parsedSummary.pairs.length > 0 && (
                            <div style={{ borderTop: "1px solid #1f2937", background: "#0b0d10", padding: "8px" }}>
                                <div style={{ color: "#cbd5e1", fontSize: 12, marginBottom: 6 }}>Summary</div>
                                <table style={{ width: "100%", borderCollapse: "collapse", color: "#e6edf3", fontSize: 12 }}>
                                    <tbody>
                                        {parsedSummary.pairs.map(({ key, value }) => (
                                            <tr key={key}>
                                                <td style={{ padding: "4px 6px", color: "#9ca3af", width: "45%" }}>{key}</td>
                                                <td style={{ padding: "4px 6px" }}>{value}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {parsedSummary.rest && (
                                    <pre
                                        style={{
                                            margin: "8px 0 0",
                                            padding: "6px",
                                            whiteSpace: "pre-wrap",
                                            color: "#cbd5e1",
                                            background: "#0f1115",
                                            borderRadius: 4,
                                            maxHeight: 180,
                                            overflow: "auto"
                                        }}
                                    >
                                        {parsedSummary.rest}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                    {svg && (
                        <div style={{ flex: "0 0 45%", borderLeft: "1px solid #1f2937", background: "#0b0d10", overflow: "hidden" }}>
                            <SvgViewer svgBase64={svg} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
