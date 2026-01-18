import type { Edge, Node } from "@xyflow/react";
import type { GraphDisplay, GraphEdge, GraphHandle, GraphHandleKind, GraphIR, GraphNode } from "../types/graph";

const GRAPH_VERSION = 2;

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
 * Helper: Sorts nodes by hierarchy depth so Parents render before Children.
 * This prevents React Flow from detaching children on load.
 */
function sortNodesByHierarchy(nodes: Node[]): Node[] {
    const getDepth = (n: Node, allNodes: Node[]): number => {
        let depth = 0;
        let current = n;
        while (current.parentId) {
            depth++;
            const parent = allNodes.find(p => p.id === current.parentId);
            if (!parent) break; // Orphaned
            current = parent;
        }
        return depth;
    };

    // Sort: Depth 0 (Roots) -> Depth 1 (Children) -> Depth 2 (Grandchildren)
    return [...nodes].sort((a, b) => getDepth(a, nodes) - getDepth(b, nodes));
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
        const handles: GraphHandle[] = handleIds.sort().map((pid, idx) => ({
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
            parentId: n.parentId,
            extent: n.extent === "parent" ? "parent" : undefined,
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
        parentId: n.parentId,
        extent: n.extent,
        ...(n.parentId ? { extent: n.extent || "parent" } : {}),
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
    const sortedNodes = sortNodesByHierarchy(nodes);
    return { nodes: sortedNodes, edges };
}

/**
 * Filters the graph to return only the "Root" layer (Top-level nodes and edges).
 * This is useful for compilation and verification steps that should treat
 * nested subgraphs (like Repeat Layers) as encapsulated black boxes.
 * * Usage:
 * const { rootNodes, rootEdges } = getRootGraph(nodes, edges);
 * verifyShapes(rootNodes, rootEdges, ...);
 */
export function getRootGraph(nodes: Node[], edges: Edge[]): { rootNodes: Node[]; rootEdges: Edge[] } {
    // Root nodes: only nodes that DO NOT have a parent
    const rootNodes = nodes.filter(n => !n.parentId);
    const rootNodeIds = new Set(rootNodes.map(n => n.id));
    // Root Edges: Only edges where BOTH source and target are in root
    // This excludes:
    // - Internal edges (Child -> Child)
    // - Boundary edges managed by Repeat Layers (Child-> Parent)
    // This keeps:
    // - Normal edges (Node A -> Node B)
    // - Edges connecting to Repeat Layer external handles (Node A -> Repeat Layer)

    const rootEdges = edges.filter(e => {
        return rootNodeIds.has(e.source) && rootNodeIds.has(e.target);
    });
    return { rootNodes, rootEdges };
}
