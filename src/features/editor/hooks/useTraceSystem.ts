import { type Edge, type Node, useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildGraphIR } from "../../../utils/graphIR";
import { runTorchLensTrace } from "../../../utils/traceService";
import { buildShapeComparisons, compareTraceShapes } from "../../../utils/traceAnalysis";
import { LAYER_REGISTRY } from "../../../types/nodeTypes";
import { verifyShapes, type ShapeFailure, type ShapeResult } from "../../../utils/shape_verifier";
import type { TraceResponse } from "../../../types/trace";

// Move comparison logic here or keep in utils?
// FlowEditor line 140: buildShapeComparisons(traceData, shapeResult ...)

type UseTraceSystemProps = {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    generatedCode: string;
};

export function useTraceSystem({ nodes, edges, setNodes, generatedCode }: UseTraceSystemProps) {
    const { fitView } = useReactFlow();
    const [showTrace, setShowTrace] = useState(false);
    const [traceData, setTraceData] = useState<TraceResponse | null>(null);
    const [traceLoading, setTraceLoading] = useState(false);
    const [traceError, setTraceError] = useState<string | null>(null);
    const [traceSeedPreset, setTraceSeedPreset] = useState("42");
    const [traceSeedCustom, setTraceSeedCustom] = useState("");

    // Shape Verification Logic
    const [shapeResult, setShapeResult] = useState<ShapeResult | null>(null);
    const verificationResult = useMemo(() => {
        return verifyShapes(nodes, edges, LAYER_REGISTRY);
    }, [nodes, edges]);

    useEffect(() => {
        setShapeResult(prev => {
            const prevStr = JSON.stringify(prev);
            const nextStr = JSON.stringify(verificationResult);
            return prevStr === nextStr ? prev : verificationResult;
        });
        if (!verificationResult.ok) {
            console.warn("Shape validation Failures:", verificationResult.failures);
        }
    }, [verificationResult]);

    const getTraceInputShapes = useCallback((): number[][] => {
        const inputNodes = nodes.filter(n => n.type === "input_layer");
        const shapes: number[][] = [];
        for (const node of inputNodes) {
            const data = (node.data && typeof node.data === "object") ? (node.data as any) : {};
            const liveShape = Array.isArray(data.__shape) ? data.__shape : null;
            if (liveShape && liveShape.length) {
                shapes.push(liveShape as number[]);
                continue;
            }
            const dims = Array.isArray(data.dims) ? data.dims : [];
            if (dims.length) {
                const parsed: number[] = dims.map((d: { size?: unknown }) => Number(d?.size));
                let allValid = true;
                for (const dimVal of parsed) {
                    if (!Number.isFinite(dimVal) || dimVal <= 0) {
                        allValid = false;
                        break;
                    }
                }
                if (allValid) {
                    shapes.push(parsed);
                    continue;
                }
            }
            const inferred = shapeResult?.shapes?.[node.id]?.defaultShape;
            if (Array.isArray(inferred) && inferred.length) {
                shapes.push(inferred);
            }
        }
        return shapes.length ? shapes : [[1, 3, 224, 224]];
    }, [nodes, shapeResult]);

    // Apply calculated shapes to nodes
    useEffect(() => {
        if (!verificationResult.shapes) return;
        setNodes(currentNodes => {
            const deepEqual = (a: any, b: any): boolean => {
                if (a === b) return true;
                if (!Array.isArray(a) || !Array.isArray(b)) return false;
                if (a.length !== b.length) return false;
                for (let i = 0; i < a.length; i++) {
                    if (Array.isArray(a[i]) && Array.isArray(b[i])) {
                        if (!deepEqual(a[i], b[i])) return false;
                    } else if (a[i] !== b[i]) {
                        return false;
                    }
                }
                return true;
            };
            let hasChanges = false;
            const nextNodes = currentNodes.map(n => {
                const shapeEntry = verificationResult.shapes[n.id];
                const newShapeArray = shapeEntry ? shapeEntry.defaultShape : undefined;
                const currentShapeArray =
                    n.data && typeof n.data === "object" ? (n.data as { __shape?: number[] }).__shape : undefined;
                const isSame = deepEqual(currentShapeArray, newShapeArray);
                if (isSame) return n;
                hasChanges = true;
                return {
                    ...n,
                    data: { ...n.data, __shape: newShapeArray }
                };
            });
            return hasChanges ? nextNodes : currentNodes;
        });
    }, [verificationResult, setNodes]);

    // Trace Logic
    const handleTrace = useCallback(async () => {
        setTraceLoading(true);
        setTraceError(null);
        try {
            const graph = buildGraphIR(nodes, edges);
            const resp = await runTorchLensTrace({
                graph,
                inputShapes: getTraceInputShapes(),
                code: generatedCode,
            });
            const shapeWarnings = compareTraceShapes(resp, shapeResult, edges, nodes, LAYER_REGISTRY);
            setTraceData({
                ...resp,
                warnings: [...(resp.warnings || []), ...shapeWarnings],
            });
            setShowTrace(true);
        } catch (err) {
            setTraceError("Trace failed. Backend unavailable or returned error.");
            console.error("Trace failed", err);
        } finally {
            setTraceLoading(false);
        }
    }, [nodes, edges, generatedCode, shapeResult]);

    const shapeComparisons = useMemo(
        () => (traceData ? buildShapeComparisons(traceData, shapeResult, edges, nodes, LAYER_REGISTRY) : []),
        [traceData, shapeResult, edges, nodes]
    );

    // Error Decoration on Edges
    const friendlyError = useCallback((failure: ShapeFailure) => {
        const label = failure.label || failure.nodeType || failure.nodeId;
        const inputs =
            failure.inputShapes && failure.inputShapes.length
                ? ` | inputs: ${failure.inputShapes.map(s => `[${s.join(",")}]`).join(", ")}`
                : "";
        const upstream = failure.upstream && failure.upstream.length ? ` | from: ${failure.upstream.join(", ")}` : "";
        const hint = ` | fix: adjust ${label} params or ensure upstream nodes output the expected shape`;
        return `${label}: ${failure.error}${inputs}${upstream}${hint}`;
    }, []);

    // Helper to decorate edges with error messages
    const getDecoratedEdges = useCallback((currentEdges: Edge[]) => {
        if (!shapeResult || shapeResult.ok) return currentEdges;

        // 1. Build a map of errors per node
        const failMap = new Map<string, ShapeFailure[]>();
        shapeResult.failures.forEach(f => {
            (f.upstream || []).forEach(src => {
                const key = `${src}->${f.nodeId}`;
                const arr = failMap.get(key) || [];
                arr.push(f);
                failMap.set(key, arr);
            });
        });

        // 2. Map existing edges to add/remove error data
        // We do NOT use edgesWithHandlers here because that is for the deletion logic. 
        // We just return the data needed. `useGraphState` handles the delete logic. 
        // We should merge them in the component? Or can we merge them here?
        // Ideally we return a decorator function or the specific error data.
        return currentEdges.map(e => {
            const key = `${e.source}->${e.target}`;
            const errs = failMap.get(key);
            if (!errs || !errs.length) return e;
            // If we return 'e', we keep old data. But if errors are GONE?
            // The logic above: if !errs return e. This presumes e doesn't have old errors?
            // If e had errors and now doesn't, we should clear them.
            // FlowEditor line 817: if (!errs) return e implies we don't clear?
            // Actually ReactFlow updates edges completely.
            // But if we return 'e' it has whatever data it had.
            // Wait, this function transforms the base edges. Base edges usually don't have transient error data unless we persisted it?
            // In FlowEditor `edges` state DOES NOT have error data. `decoratedEdges` MEMO is computed from `edgesWithHandlers`.

            const existingData = (e.data && typeof e.data === "object") ? e.data as Record<string, unknown> : {};
            return {
                ...e,
                type: "custom",
                data: {
                    ...existingData,
                    error: errs.map(friendlyError).join("\n"),
                },
            };
        });
    }, [shapeResult, friendlyError]);

    // Focus Failure
    const focusFailure = useCallback(
        (failure: ShapeFailure, setHighlightNodes: (s: Set<string>) => void, setHighlightEdges: (s: Set<string>) => void) => {
            const upstream = failure.upstream || [];
            const edgeIds = edges
                .filter(e => upstream.includes(e.source) && e.target === failure.nodeId)
                .map(e => e.id);
            setHighlightNodes(new Set([failure.nodeId, ...upstream]));
            setHighlightEdges(new Set(edgeIds));
            const target = nodes.find(n => n.id === failure.nodeId);
            if (target) {
                void fitView({ nodes: [target], padding: 0.4 });
            }
        },
        [edges, nodes, fitView]
    );

    return {
        showTrace, setShowTrace,
        traceData, setTraceData,
        traceLoading, setTraceLoading,
        traceError, setTraceError,
        traceSeedPreset, setTraceSeedPreset,
        traceSeedCustom, setTraceSeedCustom,
        shapeResult,
        handleTrace,
        shapeComparisons,
        getDecoratedEdges,
        focusFailure
    };
}
