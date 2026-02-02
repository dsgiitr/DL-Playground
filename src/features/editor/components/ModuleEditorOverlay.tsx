import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    Background,
    ReactFlow,
    type ReactFlowInstance,
    ReactFlowProvider,
} from "@xyflow/react";
import { type Dispatch, type SetStateAction } from "react";
import DiagramView from "../../../components/DiagramView";
import { edgeTypes } from "../../../types/edgeTypes";
import { nodeTypes } from "../../../types/nodeTypes";
import { buildGraphIR } from "../../../utils/graphIR";
import {
    type OpenModule,
    popModule,
    updateActiveModule,
} from "../../../utils/stackNavigation";
import { DuplicateModuleWarning } from "./DuplicateModuleWarning";

// Needs fitViewOptions
const fitViewOptions = { padding: 0.2 };

type ModuleEditorOverlayProps = {
    openModule: OpenModule;
    setModuleStack: Dispatch<SetStateAction<OpenModule[]>>;
    moduleFlowRef: React.MutableRefObject<ReactFlowInstance | null>;
    moduleNameInput: string;
    setModuleNameInput: (val: string) => void;
    showModuleDiagram: boolean;
    setShowModuleDiagram: (val: boolean) => void;
    showModuleSaveMenu: boolean;
    setShowModuleSaveMenu: (val: boolean) => void;
    moduleNameWarning: boolean;
    setModuleNameWarning: (val: boolean) => void;
    onModuleDrop: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    saveExistingModuleChanges: () => void;
    saveModuleAsNew: () => void;
};

export function ModuleEditorOverlay({
    openModule,
    setModuleStack,
    moduleFlowRef,
    moduleNameInput,
    setModuleNameInput,
    showModuleDiagram,
    setShowModuleDiagram,
    showModuleSaveMenu,
    setShowModuleSaveMenu,
    moduleNameWarning,
    setModuleNameWarning,
    onModuleDrop,
    onDragOver,
    saveExistingModuleChanges,
    saveModuleAsNew,
}: ModuleEditorOverlayProps) {
    if (!openModule) return null;

    return (
        <>
            <div
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "20vw",
                    height: "100vh",
                    zIndex: 29,
                    pointerEvents: "none",
                }}
            />

            <div
                style={{
                    position: "fixed",
                    top: 0,
                    right: 0,
                    width: "80vw",
                    height: "100vh",
                    zIndex: 30,
                    padding: 20,
                    pointerEvents: "auto",
                }}
            >
                <div
                    onDrop={onModuleDrop}
                    onDragOver={onDragOver}
                    style={{
                        background: "#0f1115",
                        border: "1px solid #222",
                        borderRadius: 10,
                        width: "80vw",
                        height: "92vh",
                        display: "flex",
                        flexDirection: "column",
                        boxShadow: "0 25px 60px rgba(0,0,0,0.45)",
                        pointerEvents: "auto",
                    }}
                >
                    <div
                        style={{
                            padding: "10px 12px",
                            borderBottom: "1px solid #222",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            justifyContent: "space-between",
                        }}
                    >
                        {/* editable module header to enter the updated module names  */}
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <span style={{ color: "#9ca3af", fontSize: 12 }}>Editing Module</span>
                            <input
                                value={moduleNameInput}
                                onChange={e => setModuleNameInput(e.target.value)}
                                placeholder="Module name"
                                style={{
                                    background: "#0f172a",
                                    color: "#e6edf3",
                                    border: "1px solid #1f2937",
                                    borderRadius: 6,
                                    padding: "4px 8px",
                                    fontWeight: 600,
                                    minWidth: 160,
                                }}
                            />
                            <span style={{ color: "#9ca3af", fontSize: 12 }}>({openModule.module.version})</span>
                            <span style={{ color: "#9ca3af", fontSize: 12 }}>View and edit without leaving the canvas</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, position: "relative" }}>
                            <button
                                onClick={() => setShowModuleDiagram(true)}
                                style={{
                                    padding: "6px 10px",
                                    borderRadius: 6,
                                    border: "1px solid #444",
                                    background: "#333",
                                    color: "#fff",
                                    cursor: "pointer",
                                }}
                            >
                                Diagram View
                            </button>
                            <button
                                onClick={() => setShowModuleSaveMenu(!showModuleSaveMenu)}
                                style={{
                                    padding: "6px 10px",
                                    borderRadius: 6,
                                    border: "1px solid #1f8ecd",
                                    background: "#1f8ecd",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                }}
                            >
                                Save ▾
                            </button>
                            {/* this shows the saving dropdown */}
                            {showModuleSaveMenu && (
                                <div
                                    style={{
                                        position: "absolute",
                                        right: 0,
                                        top: "100%",
                                        marginTop: 6,
                                        background: "#111827",
                                        border: "1px solid #1f2937",
                                        borderRadius: 8,
                                        padding: 6,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 6,
                                        minWidth: 160,
                                        zIndex: 5,
                                    }}
                                >
                                    <button
                                        onClick={() => {
                                            setShowModuleSaveMenu(false);
                                            saveExistingModuleChanges();
                                        }}
                                        style={{
                                            padding: "6px 8px",
                                            borderRadius: 6,
                                            border: "1px solid #334155",
                                            background: "#1f2937",
                                            color: "#e6edf3",
                                            cursor: "pointer",
                                            textAlign: "left",
                                            fontSize: 12,
                                        }}
                                    >
                                        Save changes
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowModuleSaveMenu(false);
                                            saveModuleAsNew();
                                        }}
                                        style={{
                                            padding: "6px 8px",
                                            borderRadius: 6,
                                            border: "1px solid #334155",
                                            background: "#0f172a",
                                            color: "#e6edf3",
                                            cursor: "pointer",
                                            textAlign: "left",
                                            fontSize: 12,
                                        }}
                                    >
                                        Save as new module
                                    </button>
                                </div>
                            )}
                            <button
                                onClick={() => setModuleStack(popModule)}
                                style={{
                                    padding: "6px 10px",
                                    borderRadius: 6,
                                    border: "1px solid #444",
                                    background: "#333",
                                    color: "#fff",
                                    cursor: "pointer",
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                    <div style={{ flex: 1, position: "relative" }}>
                        <ReactFlowProvider>
                            <ReactFlow
                                key={`module-editor-${openModule.module.id}-${openModule.module.updatedAt || ""}`}
                                nodes={openModule.nodes}
                                edges={openModule.edges}
                                onInit={instance => {
                                    moduleFlowRef.current = instance;
                                    instance.fitView({ padding: 0.2, includeHiddenNodes: true });
                                }}
                                onNodesChange={changes =>
                                    setModuleStack(stack =>
                                        updateActiveModule(stack, current => ({
                                            ...current,
                                            nodes: applyNodeChanges(changes, current.nodes),
                                        }))
                                    )
                                }
                                onEdgesChange={changes =>
                                    setModuleStack(stack =>
                                        updateActiveModule(stack, current => ({
                                            ...current,
                                            edges: applyEdgeChanges(changes, current.edges),
                                        }))
                                    )
                                }
                                onConnect={connection =>
                                    setModuleStack(stack =>
                                        updateActiveModule(stack, current => ({
                                            ...current,
                                            edges: addEdge(
                                                {
                                                    ...connection,
                                                    type: "custom",
                                                    data: { label: connection.source || "out" },
                                                },
                                                current.edges
                                            ),
                                        }))
                                    )
                                }
                                nodeTypes={nodeTypes}
                                edgeTypes={edgeTypes}
                                fitView
                                fitViewOptions={fitViewOptions}
                                multiSelectionKeyCode="Shift"
                                selectionOnDrag
                                style={{ background: "#0b0d10" }}
                            >
                                <Background />
                            </ReactFlow>
                        </ReactFlowProvider>
                        {moduleNameWarning && <DuplicateModuleWarning onClose={() => setModuleNameWarning(false)} />}
                    </div>
                </div>
            </div>
            {showModuleDiagram && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 60,
                        background: "rgba(0,0,0,0.72)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 12,
                    }}
                >
                    <DiagramView
                        nodes={openModule.nodes}
                        edges={openModule.edges}
                        graph={buildGraphIR(openModule.nodes, openModule.edges)}
                        onClose={() => setShowModuleDiagram(false)}
                        fullscreen
                    />
                </div>
            )}
        </>
    );
}
