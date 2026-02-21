import type { Edge, Node } from "@xyflow/react";
import type { ShapeResult } from "./shape_verifier";
import type { TraceResponse } from "../types/trace";

const parseShape = (value?: string) => {
    if (!value) return null;
    const matches = value.match(/-?\d+/g);
    if (!matches) {
        return /[\[\(]\s*[\]\)]/.test(value) ? [] : null;
    }
    return matches.map(num => Number(num));
};

const shapesEqual = (a: number[] | null, b: number[] | null) => {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((v, idx) => v === b[idx]);
};

const getInputShapes = (edges: Edge[], shapes: ShapeResult["shapes"], nodeId: string) => {
    const upstream = edges.filter(e => e.target === nodeId).map(e => e.source);
    return upstream.map(src => shapes[src]?.defaultShape || []);
};

const normalizeOpKey = (value?: string) => {
    if (!value) return "";
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
};

export type ShapeComparisonRow = {
    nodeId: string;
    label: string;
    op: string;
    inferredInput: number[] | null;
    inferredInputs: number[][];
    inferredOutput: number[] | null;
    traceInput: number[] | null;
    traceOutput: number[] | null;
    matchInput: boolean | null;
    matchOutput: boolean | null;
};

export const buildShapeComparisons = (
    trace: TraceResponse,
    shapeResult: ShapeResult | null,
    edges: Edge[],
    nodes: Node[],
    registry: Record<string, any>
) => {
    const inferredShapes: ShapeResult["shapes"] = shapeResult?.shapes || nodes.reduce<ShapeResult["shapes"]>((acc, node) => {
        const shape = (node.data as { __shape?: number[] } | undefined)?.__shape;
        if (Array.isArray(shape)) {
            acc[node.id] = { defaultShape: shape };
        }
        return acc;
    }, {});
    const comparisons: ShapeComparisonRow[] = [];
    const seen = new Set<string>();
    const opBuckets = nodes.reduce<Record<string, string[]>>((acc, node) => {
        const layer = node.type ? registry[node.type] : undefined;
        const label = layer?.label || node.type || "";
        const key = normalizeOpKey(label);
        if (!key) return acc;
        acc[key] = acc[key] || [];
        acc[key].push(node.id);
        return acc;
    }, {});
    const opCursor: Record<string, number> = {};
    trace.entries.forEach(entry => {
        const nodeIds = entry.nodeIds && entry.nodeIds.length
            ? entry.nodeIds
            : (() => {
                const opKey = normalizeOpKey(entry.op);
                const bucket = opBuckets[opKey] || [];
                const idx = opCursor[opKey] || 0;
                if (!bucket.length || idx >= bucket.length) return [];
                opCursor[opKey] = idx + 1;
                return [bucket[idx]];
            })();
        nodeIds.forEach(nodeId => {
            if (seen.has(nodeId)) return;
            seen.add(nodeId);
            const inferredInputs = getInputShapes(edges, inferredShapes, nodeId);
            const inferredInput = inferredInputs.length === 1 ? inferredInputs[0] : null;
            const inferredOutput = inferredShapes[nodeId]?.defaultShape || null;
            const traceInput = parseShape(entry.inputShape);
            const traceOutput = parseShape(entry.outputShape);
            const matchInput =
                inferredInput && inferredInput.length && traceInput && traceInput.length
                    ? shapesEqual(inferredInput, traceInput)
                    : null;
            const matchOutput = traceOutput ? shapesEqual(inferredOutput, traceOutput) : null;
            comparisons.push({
                nodeId,
                label: entry.scope || entry.op || nodeId,
                op: entry.op,
                inferredInput,
                inferredInputs,
                inferredOutput,
                traceInput,
                traceOutput,
                matchInput,
                matchOutput,
            });
        });
        if (!nodeIds.length) {
            comparisons.push({
                nodeId: entry.id,
                label: entry.scope || entry.op || entry.id,
                op: entry.op,
                inferredInput: null,
                inferredInputs: [],
                inferredOutput: null,
                traceInput: parseShape(entry.inputShape),
                traceOutput: parseShape(entry.outputShape),
                matchInput: null,
                matchOutput: null,
            });
        }
    });
    return comparisons;
};

export const compareTraceShapes = (
    trace: TraceResponse,
    shapeResult: ShapeResult | null,
    edges: Edge[],
    nodes: Node[],
    registry: Record<string, any>
) => {
    const warnings: string[] = [];
    buildShapeComparisons(trace, shapeResult, edges, nodes, registry).forEach(row => {
        if (row.matchInput === false && row.inferredInput && row.traceInput) {
            warnings.push(
                `Input shape mismatch for ${row.label} (${row.nodeId}): inferred [${row.inferredInput.join(", ")}], trace [${row.traceInput.join(", ")}].`
            );
        }
        if (row.matchOutput === false && row.inferredOutput && row.traceOutput) {
            warnings.push(
                `Output shape mismatch for ${row.label} (${row.nodeId}): inferred [${row.inferredOutput.join(", ")}], trace [${row.traceOutput.join(", ")}].`
            );
        }
    });
    return warnings;
};
