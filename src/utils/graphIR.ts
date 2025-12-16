import type { Edge, Node } from "@xyflow/react";
import type { GraphDisplay, GraphEdge, GraphIR, GraphNode, GraphHandle, GraphHandleKind } from "../types/graph";

const GRAPH_VERSION = 1;

function dedupe<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
}

// Map handle usage counts to a GraphHandleKind.
function toHandleKind(sourceCount: number, targetCount: number): GraphHandleKind {
    if (sourceCount > 0 && targetCount === 0) return "output";
    if (targetCount > 0 && sourceCount === 0) return "input";
    if (sourceCount > 0 && targetCount > 0) return "other";
    return "other";
}

function formatDisplay(n: Node): GraphDisplay {
    const data = (n.data || {}) as Record<string, unknown>;
    const type = n.type || "Layer";
    const rawLabel = typeof data.label === "string" ? data.label : undefined;
    const baseTitle = rawLabel || type;
    const params = data.params ? String(data.params) : undefined;
    const shape = Array.isArray((data as Record<string, unknown>).__shape)
        ? `shape: [${((data as Record<string, unknown>).__shape as Array<unknown>).join(",")}]`
        : undefined;
    return { title: baseTitle, params, shape };
}

/**
 * Convert the current React Flow nodes/edges into a versioned GraphIR snapshot.
 * This captures stable node IDs, handle IDs, minimal data, and edge wiring.
 */
export function buildGraphIR(nodes: Node[], edges: Edge[]): GraphIR {
    const handleUsage = new Map<string, { source: string[]; target: string[] }>();

    edges.forEach(e => {
        const sourceHandle = e.sourceHandle || "out";
        const targetHandle = e.targetHandle || "in";
        const sourceEntry = handleUsage.get(e.source) || { source: [], target: [] };
        sourceEntry.source.push(sourceHandle);
        handleUsage.set(e.source, sourceEntry);
        const targetEntry = handleUsage.get(e.target) || { source: [], target: [] };
        targetEntry.target.push(targetHandle);
        handleUsage.set(e.target, targetEntry);
    });

    const graphNodes: GraphNode[] = nodes.map(n => {
        const usage = handleUsage.get(n.id) || { source: [], target: [] };
        const handleIds = dedupe([...usage.source.map(p => p), ...usage.target.map(p => p)]);
        const handles: GraphHandle[] = handleIds
            .sort()
            .map((pid, idx) => ({
                id: pid,
                kind: toHandleKind(usage.source.filter(p => p === pid).length, usage.target.filter(p => p === pid).length),
                order: idx,
            }));
        const data = (n.data || {}) as Record<string, unknown>;
        const display = formatDisplay(n);
        return {
            id: n.id,
            type: n.type || "custom",
            label: typeof data.label === "string" ? data.label : n.type ?? n.id,
            display,
            handles,
            position: n.position,
            data,
        };
    });

    const graphEdges: GraphEdge[] = edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || "out",
        targetHandle: e.targetHandle || "in",
        kind: "data",
        data: (e.data || {}) as Record<string, unknown>,
    }));

    return {
        version: GRAPH_VERSION,
        createdAt: new Date().toISOString(),
        nodes: graphNodes,
        edges: graphEdges,
    };
}

/**
 * Convert a GraphIR snapshot back into React Flow nodes/edges.
 */
export function applyGraphIR(graph: GraphIR): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = graph.nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: n.position || { x: 0, y: 0 },
        data: { ...(n.data || {}), label: n.display?.title ?? n.label },
    }));

    const edges: Edge[] = graph.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        data: e.data,
        type: "custom",
    }));

    return { nodes, edges };
}
