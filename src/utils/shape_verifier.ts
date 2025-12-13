import type { Edge, Node } from "@xyflow/react";
import { LAYER_REGISTRY } from "../types/nodeTypes";

export type ShapeFailure = {
    nodeId: string;
    nodeType?: string;
    label?: string;
    error: string;
    inputShapes?: number[][];
    upstream?: string[];
};
type NodeShapes = {
    defaultShape: number[];
    byHandle?: Record<string, number[]>;
};

export type ShapeResult = {
    ok: boolean;
    shapes: Record<string, NodeShapes>;
    failures: ShapeFailure[];
};

export function verifyShapes(nodes: Node[], edges: Edge[]): ShapeResult {
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const sources: Record<string, string[]> = {};
    edges.forEach(e => {
        if (byId[e.target]) {
            (sources[e.target] ||= []).push(e.source);
        }
    });

    const shapes: Record<string, NodeShapes> = {};
    const failures: ShapeFailure[] = [];
    const pending = new Set(nodes.map(n => n.id));

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
                failures.push({ nodeId: id, nodeType: node.type, error: `Unknown node type: ${node.type ?? "undefined"}` });
                pending.delete(id);
                progressed = true;
                continue;
            }
            const inputIds = sources[id] || [];
            if (inputIds.some(src => !byId[src])) {
                failures.push({
                    nodeId: id,
                    nodeType: node.type,
                    label: layer.label,
                    error: "Missing upstream node",
                    upstream: inputIds
                });
                pending.delete(id);
                progressed = true;
                continue;
            }
            const ready = inputIds.every(src => shapes[src]);
            if (!ready) continue;

            const inputShapes = inputIds.map(src => shapes[src]?.defaultShape || []);
            const verdict = layer.shapeVerifier(node.data as any, inputShapes);
            if (!verdict.ok) {
                failures.push({
                    nodeId: id,
                    nodeType: node.type,
                    label: layer.label,
                    error: verdict.error,
                    inputShapes,
                    upstream: inputIds
                });
                pending.delete(id);
                progressed = true;
                continue;
            }
            const computed = layer.shapeCompute(node.data as any, inputShapes) as any;
            if (Array.isArray(computed)) {
                shapes[id] = { defaultShape: computed };
            } else if (computed && typeof computed === "object") {
                const entries = Object.entries(computed as Record<string, number[]>);
                const first = entries[0]?.[1] || [];
                shapes[id] = { defaultShape: first, byHandle: computed };
            } else {
                shapes[id] = { defaultShape: [] };
            }
            pending.delete(id);
            progressed = true;
        }
    }

    if (pending.size) {
        pending.forEach(id => {
            const node = byId[id];
            const layer = node?.type ? LAYER_REGISTRY[node.type] : undefined;
            failures.push({
                nodeId: id,
                nodeType: node?.type,
                label: layer?.label,
                error: "Missing upstream shape (disconnected edge or invalid source)",
                upstream: sources[id] || []
            });
        });
    }

    return { ok: failures.length === 0, shapes, failures };
}
