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
import { useCallback, useEffect, useState } from "react";
import Sidebar from "./Sidebar.tsx";
import { edgeTypes } from "./types/edgeTypes";
import { nodeTypes } from "./types/nodeTypes";
import { verifyShapes, type ShapeResult } from "./generator/shape_verifier";

let id = 0;
const getId = () => `node-${id++}`;
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
        const parsed: Node[] = JSON.parse(saved);
        // migrate legacy types (e.g., "input" -> "input_layer") to avoid built-in styles
        return parsed.map(n => (n.type === "input" ? { ...n, type: "input_layer" } : n));
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
        const savedNodes = localStorage.getItem("nodes");
        const savedEdges = localStorage.getItem("edges");
        console.log("%c--- LOADED FLOW DATA ---", "color: #bada55; font-weight: bold;");
        console.log("Nodes:", nodes);
        console.log("Edges:", edges);
        if (savedNodes) setNodes(JSON.parse(savedNodes));
        if (savedEdges) setEdges(JSON.parse(savedEdges));
    }, []);

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

    const onValidateShapes = useCallback(() => {
        const result = verifyShapes(nodes, edges);
        setShapeResult(result);
        if (!result.ok) {
            console.warn(`Shape validation failed on ${result.nodeId}: ${result.error}`);
        }
    }, [nodes, edges]);

    return (
        <div style={{ display: "flex", height: "100vh" }}>
            <Sidebar />
            <div style={{ width: "80vw", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <button onClick={onValidateShapes} style={{ padding: "8px 12px", cursor: "pointer" }}>
                        Validate Shapes
                    </button>
                    {shapeResult && shapeResult.ok && (
                        <span style={{ color: "#64ffda" }}>Shapes valid ({Object.keys(shapeResult.shapes).length} nodes)</span>
                    )}
                    {shapeResult && !shapeResult.ok && (
                        <span style={{ color: "#ff6b6b" }}>
                            Error at {shapeResult.nodeId}: {shapeResult.error}
                        </span>
                    )}
                </div>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
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
