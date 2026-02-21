import { useMemo, useEffect } from "react";
import type { TraceEntry, TraceResponse } from "../types/trace";
import type { ShapeComparisonRow } from "../utils/traceAnalysis";
import { useState, useRef, useCallback } from "react";

function SvgViewer({ svgBase64 }: { svgBase64: string }) {
    const svg = useMemo(() => atob(svgBase64), [svgBase64]);
    const [scale, setScale] = useState(1);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const clampScale = useCallback((value: number) => Math.min(3, Math.max(0.4, value)), []);

    const onWheel = useCallback((e: React.WheelEvent) => {
        if (!e.ctrlKey) return; // two-finger pinch (trackpad) or ctrl+wheel triggers zoom, plain scroll passes through
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale(prev => {
            const next = clampScale(prev + delta);
            const container = containerRef.current;
            if (container) {
                const rect = container.getBoundingClientRect();
                const offsetX = (container.scrollLeft + e.clientX - rect.left) / prev;
                const offsetY = (container.scrollTop + e.clientY - rect.top) / prev;
                // Keep the content position under the cursor stable while zooming
                container.scrollLeft = offsetX * next - (e.clientX - rect.left);
                container.scrollTop = offsetY * next - (e.clientY - rect.top);
            }
            return Number(next.toFixed(2));
        });
    }, [clampScale]);

    const resetZoom = () => setScale(1);
    const zoomIn = () => setScale(prev => Number(clampScale(prev + 0.1).toFixed(2)));
    const zoomOut = () => setScale(prev => Number(clampScale(prev - 0.1).toFixed(2)));

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
    shapeComparisons: ShapeComparisonRow[];
    onClose: () => void;
    onSelect: (nodeIds: string[]) => void;
};

export default function TraceView({ trace, loading, error, shapeComparisons, onClose, onSelect }: Props) {
    const entries = trace?.entries ?? [];
    const svg = trace?.svgBase64;
    const summary = trace?.summaryText;
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
    const [tableCollapsed, setTableCollapsed] = useState(false);
    const [comparisonOpen, setComparisonOpen] = useState(false);
    const leftPanelRef = useRef<HTMLDivElement | null>(null);
    const warnings = trace?.warnings ?? [];
    const hasError = !!error || !!warnings.length;

    useEffect(() => {
        if (!svg && trace && !warnings.length) {
            // Developer-facing log to help debug missing graphs
            console.warn("TorchLens trace: svgBase64 missing on response", trace);
        }
    }, [svg, trace, warnings.length]);

    const parsedSummary = useMemo(() => {
        if (!summary) return [];
        const sections: Array<{ title: string; items: string[]; inlineValue?: string }> = [];
        let current: { title: string; items: string[] } | null = null;

        const pushCurrent = () => {
            if (current) {
                sections.push({ ...current });
                current = null;
            }
        };

        summary.split("\n").forEach(rawLine => {
            const line = rawLine.trim();
            if (!line) return;

            const colonIdx = line.indexOf(":");
            const isHeaderOnly = colonIdx === line.length - 1;
            const hasKeyValue = colonIdx > 0 && colonIdx < line.length - 1 && !line.startsWith("-");

            if (isHeaderOnly) {
                pushCurrent();
                current = { title: line.slice(0, colonIdx).trim(), items: [] };
                return;
            }

            if (hasKeyValue) {
                pushCurrent();
                const key = line.slice(0, colonIdx).trim();
                const value = line.slice(colonIdx + 1).trim();
                sections.push({ title: key, items: [], inlineValue: value });
                return;
            }

            if (!current) {
                current = { title: "Details", items: [] };
            }
            current.items.push(line);
        });

        pushCurrent();
        return sections;
    }, [summary]);

    const toggleSection = useCallback((title: string) => {
        setCollapsedSections(prev => ({ ...prev, [title]: !prev[title] }));
    }, []);

    const summarySections = useMemo(
        () => parsedSummary.filter(section => section.title.toLowerCase() !== "log of generatedmodel forward pass".toLowerCase()),
        [parsedSummary]
    );

    const rows = useMemo(() => entries, [entries]);
    const warningText = warnings.join(" · ");
    const mismatchCount = useMemo(
        () => shapeComparisons.filter(row => row.matchInput === false || row.matchOutput === false).length,
        [shapeComparisons]
    );
    const formatShape = (shape: number[] | null) => (shape && shape.length ? `[${shape.join(", ")}]` : "—");
    const formatInputs = (inputs: number[][]) => {
        if (!inputs.length) return "—";
        if (inputs.length === 1) return formatShape(inputs[0]);
        return inputs.map(shape => formatShape(shape)).join(" | ");
    };

    useEffect(() => {
        if (!comparisonOpen) return;
        if (leftPanelRef.current) leftPanelRef.current.scrollTop = 0;
    }, [comparisonOpen]);

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
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                        <button
                            onClick={() => setComparisonOpen(open => !open)}
                            style={{
                                padding: "6px 10px",
                                borderRadius: 6,
                                border: "1px solid #374151",
                                background: comparisonOpen ? "#1f2937" : "#111827",
                                color: "#e6edf3",
                                cursor: "pointer",
                                fontSize: 12,
                            }}
                            title="Compare inferred shapes against TorchLens runtime shapes"
                        >
                            {comparisonOpen ? "Hide shape check" : "Shape check"}
                            {mismatchCount ? ` (${mismatchCount})` : ""}
                        </button>
                    </div>
                    {hasError && (
                        <div
                            style={{
                                flex: 1,
                                marginLeft: 12,
                                marginRight: 12,
                                background: "#1f2937",
                                border: "1px solid #374151",
                                borderRadius: 6,
                                padding: "6px 8px",
                                color: "#fbbf24",
                                fontSize: 12,
                                maxHeight: 60,
                                overflow: "auto",
                            }}
                        >
                            {error && <div style={{ color: "#f87171" }}>{error}</div>}
                            {warningText && <div>{warningText}</div>}
                        </div>
                    )}
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
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "row" }}>
                    <div ref={leftPanelRef} style={{ flex: "0 0 55%", overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0b0d10", border: "1px solid #1f2937", borderRadius: 6, padding: "6px 8px" }}>
                            <button
                                onClick={() => setTableCollapsed(prev => !prev)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "#e6edf3",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: 0,
                                }}
                            >
                                <span style={{ display: "inline-block", transform: tableCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.1s ease" }}>▾</span>
                                Trace entries
                            </button>
                            <span style={{ color: "#9ca3af", fontSize: 12 }}>{rows.length} items</span>
                        </div>
                        {!tableCollapsed && (
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
                        )}
                        {parsedSummary.length > 0 && (
                            <div style={{ borderTop: "1px solid #1f2937", background: "#0b0d10", padding: "8px", display: "flex", flexDirection: "column", gap: 8 }}>
                                <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 600 }}>Log of GeneratedModel forward pass</div>
                                {summarySections.map(section => (
                                    <div key={section.title} style={{ border: "1px solid #1f2937", borderRadius: 6, padding: "8px", background: "#0f1115" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: section.items.length ? 6 : 0 }}>
                                            <button
                                                onClick={() => toggleSection(section.title)}
                                                style={{
                                                    background: "none",
                                                    border: "none",
                                                    color: "#e6edf3",
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 6,
                                                    padding: 0,
                                                }}
                                            >
                                                <span style={{ display: "inline-block", transform: collapsedSections[section.title] ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.1s ease" }}>▾</span>
                                                {section.title}
                                            </button>
                                            {section.inlineValue && <span style={{ color: "#cbd5e1", fontSize: 12 }}>{section.inlineValue}</span>}
                                        </div>
                                        {section.items.length > 0 && !collapsedSections[section.title] && (
                                            <ul style={{ margin: 0, paddingLeft: 18, color: "#cbd5e1", fontSize: 12, display: "grid", gap: 4 }}>
                                                {section.items.map((item, idx) => (
                                                    <li key={idx} style={{ lineHeight: 1.4 }}>{item.replace(/^-\\s*/, "")}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                ))}
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
            {comparisonOpen && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 17, 21, 0.7)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 40,
                        padding: 20,
                    }}
                >
                    <div
                        style={{
                            width: "78vw",
                            maxHeight: "75vh",
                            background: "#0f1115",
                            border: "1px solid #27272a",
                            borderRadius: 10,
                            boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
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
                            <span style={{ color: "#f8fafc", fontWeight: 700 }}>Shape consistency</span>
                            <button
                                onClick={() => setComparisonOpen(false)}
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
                        <div style={{ padding: 12, overflow: "auto" }}>
                            {shapeComparisons.length === 0 ? (
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
                                    No shape comparison data available. Run a trace with shapes inferred.
                                </div>
                            ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", color: "#e6edf3", fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: "#111827" }}>
                                            <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #1f2937" }}>
                                                Node
                                            </th>
                                            <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #1f2937" }}>
                                                Inferred In
                                            </th>
                                            <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #1f2937" }}>
                                                Trace In
                                            </th>
                                            <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #1f2937" }}>
                                                Inferred Out
                                            </th>
                                            <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #1f2937" }}>
                                                Trace Out
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {shapeComparisons.map(row => {
                                            const inputMismatch = row.matchInput === false;
                                            const outputMismatch = row.matchOutput === false;
                                            return (
                                                <tr key={row.nodeId} style={{ background: inputMismatch || outputMismatch ? "#1a1010" : "transparent" }}>
                                                    <td style={{ padding: "8px", borderBottom: "1px solid #111827" }}>
                                                        <div style={{ fontWeight: 600 }}>{row.label}</div>
                                                        <div style={{ color: "#64748b", fontSize: 11 }}>{row.op}</div>
                                                    </td>
                                                    <td style={{ padding: "8px", borderBottom: "1px solid #111827", color: inputMismatch ? "#fca5a5" : "#e5e7eb" }}>
                                                        {formatInputs(row.inferredInputs)}
                                                    </td>
                                                    <td style={{ padding: "8px", borderBottom: "1px solid #111827", color: inputMismatch ? "#f87171" : "#e5e7eb" }}>
                                                        {formatShape(row.traceInput)}
                                                    </td>
                                                    <td style={{ padding: "8px", borderBottom: "1px solid #111827", color: outputMismatch ? "#fca5a5" : "#e5e7eb" }}>
                                                        {formatShape(row.inferredOutput)}
                                                    </td>
                                                    <td style={{ padding: "8px", borderBottom: "1px solid #111827", color: outputMismatch ? "#f87171" : "#e5e7eb" }}>
                                                        {formatShape(row.traceOutput)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
