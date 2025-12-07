import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    Background,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    type DefaultEdgeOptions,
    type Edge,
    type FitViewOptions,
    type Node,
    type OnConnect,
    type OnEdgesChange,
    type OnNodeDrag,
    type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar.tsx";
import { edgeTypes } from "./types/edgeTypes";
import { nodeTypes } from "./types/nodeTypes";
import { verifyShapes, type ShapeResult, type ShapeFailure } from "./utils/shape_verifier";

let id = 0;
const getId = () => `node-${id++}`;
const syncIdFromNodes = (nodes: Node[]) => {
    const maxId = nodes.reduce((max, n) => {
        const match = /^node-(\d+)$/.exec(n.id);
        if (!match) return max;
        const num = parseInt(match[1], 10);
        return Number.isFinite(num) ? Math.max(max, num) : max;
    }, -1);
    id = Math.max(id, maxId + 1);
};
const fitViewOptions: FitViewOptions = {
    padding: 0.2,
};

const defaultEdgeOptions: DefaultEdgeOptions = {
    animated: true,
};

const onNodeDrag: OnNodeDrag = (_, node) => {
    console.log("drag event", node.data);
};

function FlowContent() {
    const [nodes, setNodes] = useState<Node[]>(() => {
        const saved = localStorage.getItem("nodes");
        if (!saved) return [];
        const parsed: Node[] = JSON.parse(saved).map((n: Node) =>
            n.type === "input" ? { ...n, type: "input_layer" } : n
        );
        syncIdFromNodes(parsed);
        return parsed;
    });
    const [edges, setEdges] = useState<Edge[]>(() => {
        const saved = localStorage.getItem("edges");
        return saved ? JSON.parse(saved) : [];
    });
    const [shapeResult, setShapeResult] = useState<ShapeResult | null>(null);
    const { screenToFlowPosition } = useReactFlow();

    const onNodesChange: OnNodesChange = useCallback(
        changes => setNodes(nds => applyNodeChanges(changes, nds)),
        [setNodes]
    );
    const onEdgesChange: OnEdgesChange = useCallback(
        changes => setEdges(eds => applyEdgeChanges(changes, eds)),
        [setEdges]
    );
    const onConnect: OnConnect = useCallback(connection => setEdges(eds => addEdge(connection, eds)), [setEdges]);
    const onDragOver = (event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    };

    useEffect(() => {
        localStorage.setItem("nodes", JSON.stringify(nodes));
        localStorage.setItem("edges", JSON.stringify(edges));
    }, [nodes, edges]);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData("application/reactflow");
            if (!type) return;

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode: Node = {
                id: getId(),
                type: type,
                position,
                data: {},
            };

            setNodes(nds => nds.concat(newNode));
        },
        [screenToFlowPosition, setNodes]
    );

    useEffect(() => {
        const result = verifyShapes(nodes, edges);
        setShapeResult(result);
        if (!result.ok) {
            console.warn("Shape validation failures:", result.failures);
        }
    }, [nodes, edges]);

    useEffect(() => {
        if (!shapeResult || !shapeResult.shapes) return;
        setNodes(prev => {
            let changed = false;
            const next = prev.map(n => {
                const newShape = shapeResult.shapes[n.id];
                if (!newShape) return n;
                const oldShape = (n.data as any).__shape as number[] | undefined;
                const same =
                    Array.isArray(oldShape) &&
                    Array.isArray(newShape) &&
                    oldShape.length === newShape.length &&
                    oldShape.every((v, i) => v === newShape[i]);
                if (same) return n;
                changed = true;
                return { ...n, data: { ...n.data, __shape: newShape } };
            });
            return changed ? next : prev;
        });
    }, [shapeResult, setNodes]);

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

    const decoratedEdges = useMemo(() => {
        if (!shapeResult || shapeResult.ok) return edges;
        const failMap = new Map<string, ShapeFailure[]>();
        shapeResult.failures.forEach(f => {
            (f.upstream || []).forEach(src => {
                const key = `${src}->${f.nodeId}`;
                const arr = failMap.get(key) || [];
                arr.push(f);
                failMap.set(key, arr);
            });
        });
        return edges.map(e => {
            const key = `${e.source}->${e.target}`;
            const errs = failMap.get(key);
            if (!errs || !errs.length) return e;
            return {
                ...e,
                type: "custom",
                data: {
                    ...(e as any).data,
                    error: errs.map(friendlyError).join("\n"),
                },
            };
        });
    }, [edges, shapeResult, friendlyError]);

    return (
        <div style={{ display: "flex", height: "100vh" }}>
            <Sidebar />
            <div style={{ width: "80vw", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "8px", display: "flex", gap: "8px", alignItems: "center", minHeight: "32px" }}>
                    {shapeResult && shapeResult.ok && (
                        <span style={{ color: "#64ffda" }}>
                            Shapes valid ({Object.keys(shapeResult.shapes).length} nodes). Graph is consistent.
                        </span>
                    )}
                    {shapeResult && !shapeResult.ok && shapeResult.failures.length > 0 && (
                        <span style={{ color: "#ff6b6b" }}>
                            {shapeResult.failures.map(friendlyError).join(" | ")}
                        </span>
                    )}
                </div>
                <ReactFlow
                    nodes={nodes}
                    edges={decoratedEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeDrag={onNodeDrag}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    fitViewOptions={fitViewOptions}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    defaultEdgeOptions={defaultEdgeOptions}
                >
                    <Background />
                </ReactFlow>
            </div>
        </div>
    );
}

export default function Flow() {
    return (
        <ReactFlowProvider>
            <FlowContent />
        </ReactFlowProvider>
    );
}
