import type { Edge, Node } from "@xyflow/react";
import type { GraphDisplay, GraphEdge, GraphIR, GraphNode, GraphPort, GraphPortKind } from "../types/graph";

const GRAPH_VERSION = 1;

function dedupe<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
}

function toPortKind(sourceCount: number, targetCount: number): GraphPortKind {
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
 * This captures stable node IDs, port IDs (from handles), minimal data, and edge wiring.
 */
export function buildGraphIR(nodes: Node[], edges: Edge[]): GraphIR {
    const portUsage = new Map<string, { source: string[]; target: string[] }>();

    edges.forEach(e => {
        const sourcePort = e.sourceHandle || "out";
        const targetPort = e.targetHandle || "in";
        const sourceEntry = portUsage.get(e.source) || { source: [], target: [] };
        sourceEntry.source.push(sourcePort);
        portUsage.set(e.source, sourceEntry);
        const targetEntry = portUsage.get(e.target) || { source: [], target: [] };
        targetEntry.target.push(targetPort);
        portUsage.set(e.target, targetEntry);
    });

    const graphNodes: GraphNode[] = nodes.map(n => {
        const usage = portUsage.get(n.id) || { source: [], target: [] };
        const portIds = dedupe([...usage.source.map(p => p), ...usage.target.map(p => p)]);
        const ports: GraphPort[] = portIds
            .sort()
            .map((pid, idx) => ({
                id: pid,
                kind: toPortKind(usage.source.filter(p => p === pid).length, usage.target.filter(p => p === pid).length),
                order: idx,
            }));
        const data = (n.data || {}) as Record<string, unknown>;
        const display = formatDisplay(n);
        return {
            id: n.id,
            type: n.type || "custom",
            label: typeof data.label === "string" ? data.label : n.type ?? n.id,
            display,
            ports,
            position: n.position,
            data,
        };
    });

    const graphEdges: GraphEdge[] = edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourcePort: e.sourceHandle || "out",
        targetPort: e.targetHandle || "in",
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
        sourceHandle: e.sourcePort,
        targetHandle: e.targetPort,
        data: e.data,
        type: "custom",
    }));

    return { nodes, edges };
}
