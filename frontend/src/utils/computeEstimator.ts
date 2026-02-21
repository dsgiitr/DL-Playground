import type { Edge, Node } from "@xyflow/react";
import type { ShapeResult } from "./shape_verifier";

export type NodeCompute = {
    nodeId: string;
    label: string;
    type: string;
    params: number;
    flops: number;
};

export type ComputeSummary = {
    totalParams: number;
    totalFlops: number;
    nodes: NodeCompute[];
};

const getOutputShape = (shapes: ShapeResult["shapes"], nodeId: string) =>
    shapes[nodeId]?.defaultShape || [];

const getInputShapes = (edges: Edge[], shapes: ShapeResult["shapes"], nodeId: string) => {
    const upstream = edges.filter(e => e.target === nodeId).map(e => e.source);
    return upstream.map(src => shapes[src]?.defaultShape || []);
};

export function estimateGraphCost(
    nodes: Node[],
    edges: Edge[],
    shapeResult: ShapeResult | null,
    registry: Record<string, any>
): ComputeSummary {
    if (!shapeResult) return { totalParams: 0, totalFlops: 0, nodes: [] };
    const { shapes } = shapeResult;
    const nodeCosts: NodeCompute[] = nodes.map(node => {
        const layer = node.type ? registry[node.type] : undefined;
        const label = layer?.label || node.type || node.id;
        const outputShape = getOutputShape(shapes, node.id);
        const inputShapes = getInputShapes(edges, shapes, node.id);
        const cost = layer?.estimateCost
            ? layer.estimateCost(node.data, inputShapes, outputShape, { registry })
            : { params: 0, flops: 0 };
        return { nodeId: node.id, label, type: node.type || "", params: cost.params, flops: cost.flops };
    });

    const totalParams = nodeCosts.reduce((sum, n) => sum + n.params, 0);
    const totalFlops = nodeCosts.reduce((sum, n) => sum + n.flops, 0);
    return { totalParams, totalFlops, nodes: nodeCosts };
}
