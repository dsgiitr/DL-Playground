import type { Edge, Node } from "@xyflow/react";
import type { GraphIR, GraphNode } from "../types/graph";
import { LAYER_REGISTRY } from "../nodes/registry";

type DiagramFamily = "input" | "output" | "merge" | "activation" | "block" | "other";

// Sizing heuristics for paper nodes. Keep them generous to avoid text overflow.
const SPACIOUS_MIN_WIDTH = 220;
const SPACIOUS_MAX_WIDTH = 480;
const SPACIOUS_BASE_HEIGHT = 60;
const SPACIOUS_LINE_HEIGHT = 22;

const COMPACT_MIN_WIDTH = 180;
const COMPACT_MAX_WIDTH = 360;
const COMPACT_BASE_HEIGHT = 50;
const COMPACT_LINE_HEIGHT = 18;

function resolveDefinition(node: GraphNode) {
    return LAYER_REGISTRY[node.type];
}

function displayName(node: GraphNode): string {
    const def = resolveDefinition(node);
    const raw = node.display?.title || def?.diagramLabel || def?.label || node.type || node.id;
    if (!raw) return "Layer";
    const clean = raw.replace(/_layer$/i, "");
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function formatParams(node: GraphNode): string | undefined {
    if (node.display?.params) return node.display.params;
    const data = (node.data || {}) as Record<string, unknown>;
    const params = data.params;
    if (!params) return undefined;
    if (typeof params === "string" || typeof params === "number") return String(params);
    if (typeof params === "object" && params !== null) {
        const p = params as Record<string, unknown>;
        const inCh = p.in ?? p.in_channels ?? p.in_features;
        const outCh = p.out ?? p.out_channels ?? p.out_features;
        const k = p.k ?? p.kernel ?? p.kernel_size;
        const s = p.s ?? p.stride;
        const stride = Array.isArray(s) ? `s${s.join("x")}` : s !== undefined ? `s${s}` : "";
        const kernel = Array.isArray(k) ? `k${k.join("x")}` : k !== undefined ? `k${k}` : "";
        const io =
            inCh !== undefined || outCh !== undefined
                ? `${inCh !== undefined ? inCh : "?"}→${outCh !== undefined ? outCh : "?"}`
                : null;
        const parts = [io, kernel, stride].filter(Boolean);
        if (parts.length) return parts.join(" ");
    }
    return JSON.stringify(params);
}

function formatShape(node: GraphNode): string | undefined {
    if (node.display?.shape) return node.display.shape;
    const data = (node.data || {}) as Record<string, unknown>;
    const shape = data.__shape;
    if (Array.isArray(shape)) return `shape: [${(shape as Array<unknown>).join(",")}]`;
    return undefined;
}

function buildLabel(node: GraphNode): string {
    const title = displayName(node);
    const paramLine = formatParams(node);
    const shapeLine = formatShape(node);
    const lines = [title];
    if (paramLine) lines.push(paramLine);
    if (shapeLine) lines.push(shapeLine);
    return lines.join("\n");
}

function measureSize(label: string, mode: "spacious" | "compact") {
    const lines = label.split("\n");
    const longest = Math.max(...lines.map(l => l.length), 4);
    const minWidth = mode === "spacious" ? SPACIOUS_MIN_WIDTH : COMPACT_MIN_WIDTH;
    const maxWidth = mode === "spacious" ? SPACIOUS_MAX_WIDTH : COMPACT_MAX_WIDTH;
    const baseHeight = mode === "spacious" ? SPACIOUS_BASE_HEIGHT : COMPACT_BASE_HEIGHT;
    const lineHeight = mode === "spacious" ? SPACIOUS_LINE_HEIGHT : COMPACT_LINE_HEIGHT;
    const width = Math.min(maxWidth, Math.max(minWidth, longest * 9 + 48));
    const height = baseHeight + lineHeight * (lines.length - 1);
    return { width, height };
}

/**
 * Project GraphIR → lightweight nodes/edges for diagram/layout rendering.
 */
export function projectGraphToDiagram(
    graph: GraphIR,
    opts?: { sizingMode?: "spacious" | "compact"; showShapes?: boolean }
): { nodes: Node[]; edges: Edge[] } {
    const sizingMode = opts?.sizingMode ?? "spacious";
    const showShapes = opts?.showShapes ?? true;
    // De-dupe by id to avoid React key collisions if upstream graph has accidental duplicates.
    const nodeMap = new Map<string, Node>();
    graph.nodes.forEach(n => {
        const label = buildLabel(n);
        const { width, height } = measureSize(label, sizingMode);
        const def = resolveDefinition(n);
        const family = (def?.diagramFamily as DiagramFamily | undefined) ?? "block";
        // Ensure merge/activation nodes have ample square space for text inside the diamond/circle.
        const adjustedWidth =
            family === "merge" || family === "activation" ? Math.max(width, height, 140) : width;
        const adjustedHeight =
            family === "merge" || family === "activation" ? Math.max(width, height, 140) : height;
        const finalLabel = showShapes ? label : label.split("\n")[0];
        nodeMap.set(n.id, {
            id: n.id,
            type: "diagram",
            data: { label: finalLabel, kind: family },
            position: n.position || { x: 0, y: 0 },
            width: adjustedWidth,
            height: adjustedHeight,
        });
    });

    const edgeMap = new Map<string, Edge>();
    graph.edges.forEach(e => {
        edgeMap.set(e.id, {
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            data: e.data,
            type: "custom",
        });
    });

    const nodes: Node[] = Array.from(nodeMap.values());
    const edges: Edge[] = Array.from(edgeMap.values());

    return { nodes, edges };
}
