import { Background, ReactFlow, type ReactFlowInstance } from "@xyflow/react";
import { type Node, type Edge, type OnNodesChange, type OnEdgesChange, type OnConnect } from "@xyflow/react";
import { nodeTypes } from "../../../types/nodeTypes";
import { edgeTypes } from "../../../types/edgeTypes";

const fitViewOptions = { padding: 0.2 };
const defaultEdgeOptions = { animated: true };

type EditorCanvasProps = {
    nodesForFlow: Node[];
    highlightedEdges: Edge[];
    onNodesChange: OnNodesChange;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
    onNodeDragStop: any; // Type from useRepeatSystem
    onMainDrop: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onSelectionChange: any;
    clearSelection: () => void;
    setMainFlowRef: (rf: ReactFlowInstance) => void;
}

export function EditorCanvas({
    nodesForFlow,
    highlightedEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeDragStop,
    onMainDrop,
    onDragOver,
    onSelectionChange,
    clearSelection,
    setMainFlowRef
}: EditorCanvasProps) {
    return (
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: "0 0 0 0" }}>
                <ReactFlow
                    nodes={nodesForFlow}
                    edges={highlightedEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeDragStop={onNodeDragStop}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    fitViewOptions={fitViewOptions}
                    onDrop={onMainDrop}
                    onDragOver={onDragOver}
                    onSelectionChange={onSelectionChange}
                    onPaneClick={clearSelection}
                    multiSelectionKeyCode="Shift"
                    selectionOnDrag
                    defaultEdgeOptions={defaultEdgeOptions}
                    onInit={setMainFlowRef}
                >
                    <Background />
                </ReactFlow>
            </div>
        </div>
    );
}
