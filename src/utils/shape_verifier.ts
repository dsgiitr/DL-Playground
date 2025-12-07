import type { Edge, Node } from "@xyflow/react";
import { LAYER_REGISTRY } from "../types/nodeTypes";

export type ShapeSuccess = { ok: true; shapes: Record<string, number[]> };
export type ShapeFailure = {
    ok: false;
    nodeId: string;
    nodeType?: string;
    label?: string;
    error: string;
    inputShapes?: number[][];
    upstream?: string[];
};
export type ShapeResult = ShapeSuccess | ShapeFailure;

export function verifyShapes(nodes: Node[], edges: Edge[]): ShapeResult {
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const sources: Record<string, string[]> = {};
    edges.forEach(e => {
        if (byId[e.target]) {
            (sources[e.target] ||= []).push(e.source);
        }
    });

    const shapes: Record<string, number[]> = {};
    const pending = new Set(nodes.map(n => n.id));

    // iterative propagation to avoid ordering issues
    let progressed = true;
    while (pending.size && progressed) {
        progressed = false;
        for (const id of Array.from(pending)) {
            const node = byId[id];
            if (!node) {
                pending.delete(id);
                continue;
            }
            const layer = node.type ? LAYER_REGISTRY[node.type] : undefined;
            if (!layer) {
                return { ok: false, nodeId: id, nodeType: node.type, error: `Unknown node type: ${node.type ?? "undefined"}` };
            }
            const inputIds = sources[id] || [];
            if (inputIds.some(src => !byId[src])) {
                return {
                    ok: false,
                    nodeId: id,
                    nodeType: node.type,
                    label: layer.label,
                    error: "Missing upstream node",
                    upstream: inputIds
                };
            }
            const ready = inputIds.every(src => shapes[src]);
            if (!ready) continue;

            const inputShapes = inputIds.map(src => shapes[src]!);
            const verdict = layer.shapeVerifier(node.data as any, inputShapes);
            if (!verdict.ok) {
                return {
                    ok: false,
                    nodeId: id,
                    nodeType: node.type,
                    label: layer.label,
                    error: verdict.error,
                    inputShapes,
                    upstream: inputIds
                };
            }
            shapes[id] = layer.shapeCompute(node.data as any, inputShapes);
            pending.delete(id);
            progressed = true;
        }
    }

    if (pending.size) {
        const id = Array.from(pending)[0];
        const node = byId[id];
        const layer = node?.type ? LAYER_REGISTRY[node.type] : undefined;
        return {
            ok: false,
            nodeId: id,
            nodeType: node?.type,
            label: layer?.label,
            error: "Missing upstream shape (disconnected edge or invalid source)",
            upstream: sources[id] || []
        };
    }

    return { ok: true, shapes };
}
