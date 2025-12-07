import type { Edge, Node } from "@xyflow/react";
import { LAYER_REGISTRY } from "../types/nodeTypes";

export type ShapeSuccess = { ok: true; shapes: Record<string, number[]> };
export type ShapeFailure = { ok: false; nodeId: string; error: string };
export type ShapeResult = ShapeSuccess | ShapeFailure;

export function verifyShapes(nodes: Node[], edges: Edge[]): ShapeResult {
    // Build adjacency and indegree for topo sort
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    nodes.forEach(n => {
        adj[n.id] = [];
        inDegree[n.id] = 0;
    });
    edges.forEach(e => {
        if (adj[e.source]) adj[e.source].push(e.target);
        if (inDegree[e.target] !== undefined) inDegree[e.target]++;
    });

    // Topological order
    const queue: string[] = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    const order: string[] = [];
    while (queue.length) {
        const u = queue.shift()!;
        order.push(u);
        adj[u]?.forEach(v => {
            inDegree[v]--;
            if (inDegree[v] === 0) queue.push(v);
        });
    }
    // Fallback to declared order if cycle exists
    const sequence = order.length === nodes.length ? order : nodes.map(n => n.id);
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const sources: Record<string, string[]> = {};
    edges.forEach(e => {
        (sources[e.target] ||= []).push(e.source);
    });

    const shapes: Record<string, number[]> = {};

    for (const id of sequence) {
        const node = byId[id];
        if (!node) continue;
        const layer = node.type ? LAYER_REGISTRY[node.type] : undefined;
        if (!layer) {
            return { ok: false, nodeId: id, error: `Unknown node type: ${node.type ?? "undefined"}` };
        }

        const inputIds = sources[id] || [];
        const inputShapes = inputIds
            .map(src => shapes[src])
            .filter((s): s is number[] => Array.isArray(s));
        if (inputShapes.length !== inputIds.length) {
            return { ok: false, nodeId: id, error: "Missing upstream shape (disconnected edge or invalid source)" };
        }

        const verdict = layer.shapeVerifier(node.data as any, inputShapes);
        if (!verdict.ok) {
            return { ok: false, nodeId: id, error: verdict.error };
        }

        shapes[id] = layer.shapeCompute(node.data as any, inputShapes);
    }

    return { ok: true, shapes };
}
