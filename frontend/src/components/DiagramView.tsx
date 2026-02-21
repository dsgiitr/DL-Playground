import { useEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { layoutDiagramWithElk, type LayoutDirection } from "../utils/layout";
import { buildGraphIR } from "../utils/graphIR";
import type { GraphIR } from "../types/graph";
import { projectGraphToDiagram } from "../utils/diagramProjector";
import type { ReactNode } from "react";

// DiagramView renders a publication-style SVG: minimal chrome, clean routing, export-ready.

type DiagramNode = {
    id: string;
    kind: "input" | "output" | "merge" | "activation" | "block" | "other";
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

type DiagramEdge = {
    id: string;
    sections: Array<Array<{ x: number; y: number }>>;
    data?: Record<string, unknown>;
};

type LayoutResult = {
    width: number;
    height: number;
    nodes: DiagramNode[];
    edges: DiagramEdge[];
};

type DiagramTheme = {
    background: string;
    edge: string;
    text: string;
    subtitle: string;
    fills: {
        input: string;
        output: string;
        block: string;
        activation: string;
        merge: string;
        flatten: string;
        other: string;
    };
    stroke: string;
};

const paperTheme: DiagramTheme = {
    background: "#f8f9fb",
    edge: "#1f2937",
    text: "#1f2937",
    subtitle: "#475569",
    fills: {
        input: "#e5e7eb",
        output: "#e5e7eb",
        block: "#c7d7f2",
        activation: "#d8e9d3",
        merge: "#f1e9d7",
        flatten: "#e9c9a8",
        other: "#f5f7fb",
    },
    stroke: "#1f2937",
};

function edgePath(sections: DiagramEdge["sections"]) {
    // Use all sections and points as straight segments; cleaner and matches ELK routing.
    const points = sections.flat();
    if (points.length < 2) return "";
    const [first, ...rest] = points;
    return `M ${first.x} ${first.y} ` + rest.map(p => `L ${p.x} ${p.y}`).join(" ");
}

function classifyKind(label: string): DiagramNode["kind"] {
    const lower = label.toLowerCase();
    if (lower.includes("input")) return "input";
    if (lower.includes("output")) return "output";
    if (lower.includes("add") || lower.includes("merge") || lower.includes("concat")) return "merge";
    if (lower.includes("relu") || lower.includes("gelu") || lower.includes("sigmoid") || lower.includes("tanh")) return "activation";
    if (lower.includes("conv") || lower.includes("linear") || lower.includes("dense") || lower.includes("attention") || lower.includes("lstm") || lower.includes("gru")) return "block";
    return "other";
}

export default function DiagramView({
    nodes,
    edges,
    direction = "LR",
    onClose,
    graph,
    extraActions,
    fullscreen = true,
}: {
    nodes: Node[];
    edges: Edge[];
    direction?: LayoutDirection;
    onClose: () => void;
    graph?: GraphIR;
    extraActions?: ReactNode;
    fullscreen?: boolean;
}) {
    const [layout, setLayout] = useState<LayoutResult | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [exporting, setExporting] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [showShapes, setShowShapes] = useState(true);
    const [sizingMode, setSizingMode] = useState<"spacious" | "compact">("spacious");
    const [dir, setDir] = useState<LayoutDirection>(direction);
    const graphInput = useMemo<GraphIR>(() => graph ?? buildGraphIR(nodes, edges), [graph, nodes, edges]);
    const projected = useMemo(
        () =>
            projectGraphToDiagram(graphInput, {
                sizingMode,
                showShapes,
            }),
        [graphInput, sizingMode, showShapes]
    );
    const theme = paperTheme;

    useEffect(() => {
        let cancelled = false;
        const runLayout = async () => {
            try {
                const layoutResult = await layoutDiagramWithElk(projected.nodes, projected.edges, dir);
                if (!cancelled) setLayout(layoutResult as LayoutResult);
            } catch (err) {
                console.error("Diagram layout failed", err);
            }
        };
        runLayout();
        return () => {
            cancelled = true;
        };
    }, [projected, dir]);

    const exportSvg = async () => {
        if (!svgRef.current) return;
        try {
            setExporting(true);
            const serializer = new XMLSerializer();
            const raw = serializer.serializeToString(svgRef.current);
            const blob = new Blob([raw], { type: "image/svg+xml" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `diagram-${Date.now()}.svg`;
            link.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    };

    const viewBox = useMemo(() => {
        if (!layout) return "0 0 1200 800";
        return `0 0 ${layout.width + 80} ${layout.height + 80}`;
    }, [layout]);

    const shellStyle = fullscreen
        ? {
              position: "fixed" as const,
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
              padding: 20,
          }
        : {
              position: "absolute" as const,
              inset: 0,
              background: "#0b0d10",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 12,
          };

    const panelStyle = fullscreen
        ? {
              background: "#0f1115",
              border: "1px solid #222",
              borderRadius: 10,
              width: "90vw",
              height: "90vh",
              display: "flex",
              flexDirection: "column" as const,
              boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
          }
        : {
              background: "#0f1115",
              border: "1px solid #222",
              borderRadius: 10,
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column" as const,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
          };

    return (
        <div style={shellStyle}>
            <div style={panelStyle}>
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
                        <span style={{ color: "#e6edf3", fontWeight: 700 }}>Diagram Mode (paper view)</span>
                        {!layout && <span style={{ color: "#9ca3af" }}>computing layout…</span>}
                        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#cbd5e1", fontSize: 12 }}>
                            Direction:
                            <select
                                value={dir}
                                onChange={e => setDir(e.target.value as LayoutDirection)}
                                style={{ background: "#111", color: "#e6edf3", border: "1px solid #333", borderRadius: 4, padding: "2px 6px", fontSize: 12 }}
                            >
                                <option value="LR">Left → Right</option>
                                <option value="TB">Top → Bottom</option>
                            </select>
                        </label>
                        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#cbd5e1", fontSize: 12 }}>
                            Size:
                            <select
                                value={sizingMode}
                                onChange={e => setSizingMode(e.target.value as "spacious" | "compact")}
                                style={{ background: "#111", color: "#e6edf3", border: "1px solid #333", borderRadius: 4, padding: "2px 6px", fontSize: 12 }}
                            >
                                <option value="spacious">Spacious</option>
                                <option value="compact">Compact</option>
                            </select>
                        </label>
                        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#cbd5e1", fontSize: 12 }}>
                            <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
                            Show labels
                        </label>
                        <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#cbd5e1", fontSize: 12 }}>
                            <input type="checkbox" checked={showShapes} onChange={e => setShowShapes(e.target.checked)} />
                            Show shapes
                        </label>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={exportSvg}
                            disabled={!layout || exporting}
                            style={{
                                padding: "6px 10px",
                                borderRadius: 6,
                                border: "1px solid #444",
                                background: exporting ? "#222" : "#1f8ecd",
                                color: exporting ? "#666" : "#fff",
                                cursor: exporting ? "not-allowed" : "pointer",
                            }}
                        >
                            {exporting ? "Exporting…" : "Export SVG"}
                        </button>
                        {extraActions}
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
                </div>
                <div style={{ flex: 1, background: "#0b0d10", overflow: "auto", padding: 16 }}>
                    <svg
                        ref={svgRef}
                        width="100%"
                        height="100%"
                        viewBox={viewBox}
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ background: theme.background, borderRadius: 8 }}
                    >
                        <defs>
                            <marker
                                id="arrow"
                                viewBox="0 0 10 10"
                                refX="9"
                                refY="5"
                                markerWidth="6"
                                markerHeight="6"
                                orient="auto-start-reverse"
                                fill={theme.edge}
                            >
                                <path d="M 0 0 L 10 5 L 0 10 z" />
                            </marker>
                        </defs>
                        {layout?.edges.map(edge => {
                            const d = edgePath(edge.sections);
                            if (!d) return null;
                            const kind = (edge.data as Record<string, unknown> | undefined)?.kind;
                            const main = (edge.data as Record<string, unknown> | undefined)?.main === true;
                            const isSkip = kind === "skip";
                            return (
                                <path
                                    key={edge.id}
                                    d={d}
                                    fill="none"
                                    stroke={theme.edge}
                                    strokeWidth={main ? 2.5 : 1.8}
                                    strokeDasharray={isSkip ? "6 6" : undefined}
                                    markerEnd="url(#arrow)"
                                />
                            );
                        })}
                        {layout?.nodes.map(n => {
                            const kind = n.kind ?? classifyKind(n.label);
                            const centerX = n.width / 2;
                            const centerY = n.height / 2;
                            const fillColor = (() => {
                                if (kind === "input") return theme.fills.input;
                                if (kind === "output") return theme.fills.output;
                                if (kind === "activation") return theme.fills.activation;
                                if (kind === "merge") return theme.fills.merge;
                                if (n.label.toLowerCase().includes("flatten")) return theme.fills.flatten;
                                if (kind === "block") return theme.fills.block;
                                return theme.fills.other;
                            })();

                            const renderShape = () => {
                                if (kind === "input" || kind === "output") {
                                    return (
                                        <rect
                                            x={0}
                                            y={0}
                                            rx={n.height / 2}
                                            ry={n.height / 2}
                                            width={n.width}
                                            height={n.height}
                                            fill={fillColor}
                                            stroke={theme.stroke}
                                            strokeWidth={1.5}
                                        />
                                    );
                                }
                                if (kind === "merge") {
                                    const size = Math.min(n.width, n.height);
                                    const half = size / 2 - 2;
                                    return (
                                        <g transform={`translate(${centerX}, ${centerY})`}>
                                            <polygon
                                                points={`0,-${half} ${half},0 0,${half} -${half},0`}
                                                fill={fillColor}
                                                stroke={theme.stroke}
                                                strokeWidth={1.5}
                                            />
                                        </g>
                                    );
                                }
                                if (kind === "activation") {
                                    const r = Math.min(n.width, n.height) / 2 - 6;
                                    return (
                                        <g transform={`translate(${centerX}, ${centerY})`}>
                                            <circle r={r} fill={fillColor} stroke={theme.stroke} strokeWidth={1.5} />
                                        </g>
                                    );
                                }
                                return (
                                    <rect
                                        x={0}
                                        y={0}
                                        rx={8}
                                        ry={8}
                                        width={n.width}
                                        height={n.height}
                                        fill={fillColor}
                                        stroke={theme.stroke}
                                        strokeWidth={1.5}
                                    />
                                );
                            };

                            return (
                                <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                                    {renderShape()}
                                    {showLabels && (
                                        <text
                                            x={centerX}
                                            y={centerY}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            fontFamily="Inter, system-ui, sans-serif"
                                            fontSize={14}
                                            fill={theme.text}
                                            fontWeight={600}
                                        >
                                            {n.label}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>
        </div>
    );
}
