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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "./Sidebar.tsx";
import { edgeTypes } from "./types/edgeTypes";
import { nodeTypes } from "./types/nodeTypes";
import { verifyShapes, type ShapeResult, type ShapeFailure } from "./utils/shape_verifier";
import { generatePyTorchCode } from "./utils/dummy_generator.ts";
import CodeViewer from "./components/CodeViewer.tsx";

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

    const [showLiveCode, setShowLiveCode] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(240);
    const [codePanelWidth, setCodePanelWidth] = useState(360);
    const [dragSidebar, setDragSidebar] = useState(false);
    const [dragCodePanel, setDragCodePanel] = useState(false);
    const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
    const [highlightEdges, setHighlightEdges] = useState<Set<string>>(new Set());
    const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
    const historyIndexRef = useRef(0);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const isRestoring = useRef(false);
    const skipHistory = useRef(false);

    const { screenToFlowPosition } = useReactFlow();

    const onNodesChange: OnNodesChange = useCallback(
        changes => setNodes(nds => applyNodeChanges(changes, nds)),
        [setNodes]
    );
    const onEdgesChange: OnEdgesChange = useCallback(
        changes => setEdges(eds => applyEdgeChanges(changes, eds)),
        [setEdges]
    );
    const onConnect: OnConnect = useCallback(connection => {
        setEdges(eds => {
            const sameSource = eds.filter(e => e.source === connection.source && e.sourceHandle === connection.sourceHandle);
            const suffix = sameSource.length ? `_dup${sameSource.length}` : "";
            const labelBase = connection.source
                ? `out_${connection.source}${connection.sourceHandle ? `_${connection.sourceHandle}` : ""}${suffix}`
                : "out";
            return addEdge(
                {
                    ...connection,
                    type: "custom",
                    data: {
                        label: labelBase
                    }
                },
                eds
            );
        });
    }, [setEdges]);

    const generated = useMemo(() => generatePyTorchCode(nodes, edges), [nodes, edges]);
    const generatedCode = generated.code;

    const onGenerateCode = useCallback(() => {
        setShowLiveCode(val => !val);
    }, []);

    const onDownloadCode = useCallback(() => {
        const blob = new Blob([generatedCode], { type: "text/x-python" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "generated_model.py";
        a.click();
        URL.revokeObjectURL(url);
    }, [generatedCode]);

    const onDragOver = (event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    };

    const cloneSnapshot = useCallback((n: Node[], e: Edge[]) => {
        const copyNodes = n.map(node => ({
            ...node,
            data: node.data ? { ...node.data } : {},
            position: { ...node.position }
        }));
        const copyEdges = e.map(edge => ({ ...edge, data: edge.data ? { ...edge.data } : {} }));
        return { nodes: copyNodes, edges: copyEdges };
    }, []);

    const applySnapshot = useCallback((snapshot: { nodes: Node[]; edges: Edge[] }) => {
        isRestoring.current = true;
        setNodes(snapshot.nodes);
        setEdges(snapshot.edges);
        syncIdFromNodes(snapshot.nodes);
    }, []);

    const handleUndo = useCallback(() => {
        if (!canUndo) return;
        const targetIndex = Math.max(0, historyIndexRef.current - 1);
        historyIndexRef.current = targetIndex;
        const snapshot = historyRef.current[targetIndex];
        applySnapshot(cloneSnapshot(snapshot.nodes, snapshot.edges));
        setCanUndo(targetIndex > 0);
        setCanRedo(targetIndex < historyRef.current.length - 1);
    }, [canUndo, applySnapshot, cloneSnapshot]);

    const handleRedo = useCallback(() => {
        if (!canRedo) return;
        const targetIndex = Math.min(historyRef.current.length - 1, historyIndexRef.current + 1);
        historyIndexRef.current = targetIndex;
        const snapshot = historyRef.current[targetIndex];
        applySnapshot(cloneSnapshot(snapshot.nodes, snapshot.edges));
        setCanUndo(targetIndex > 0);
        setCanRedo(targetIndex < historyRef.current.length - 1);
    }, [canRedo, applySnapshot, cloneSnapshot]);

    // Sidebar resize
    useEffect(() => {
        if (!dragSidebar) return;
        const onMove = (ev: MouseEvent) => {
            const newWidth = Math.min(400, Math.max(160, ev.clientX));
            setSidebarWidth(newWidth);
        };
        const onUp = () => setDragSidebar(false);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [dragSidebar]);

    // Code panel resize
    useEffect(() => {
        if (!dragCodePanel) return;
        const onMove = (ev: MouseEvent) => {
            const newWidth = Math.min(700, Math.max(260, window.innerWidth - ev.clientX));
            setCodePanelWidth(newWidth);
        };
        const onUp = () => setDragCodePanel(false);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [dragCodePanel]);

    useEffect(() => {
        if (!historyRef.current.length) {
            historyRef.current = [cloneSnapshot(nodes, edges)];
            historyIndexRef.current = 0;
            syncIdFromNodes(nodes);
            setCanUndo(false);
            setCanRedo(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        localStorage.setItem("nodes", JSON.stringify(nodes));
        localStorage.setItem("edges", JSON.stringify(edges));
        const restoring = isRestoring.current;
        const skipping = skipHistory.current;
        isRestoring.current = false;
        skipHistory.current = false;

        if (!restoring && !skipping) {
            const trimmed = historyRef.current.slice(0, historyIndexRef.current + 1);
            trimmed.push(cloneSnapshot(nodes, edges));
            const limited = trimmed.length > 50 ? trimmed.slice(trimmed.length - 50) : trimmed;
            historyRef.current = limited;
            historyIndexRef.current = limited.length - 1;
        }
        const canUndoNow = historyIndexRef.current > 0;
        const canRedoNow = historyIndexRef.current < historyRef.current.length - 1;
        setCanUndo(canUndoNow);
        setCanRedo(canRedoNow);
        syncIdFromNodes(nodes);
    }, [nodes, edges, cloneSnapshot]);

    const handleSelectionTargets = useCallback(
        (targets: { nodeIds: string[]; edgeIds: string[] }) => {
            setHighlightNodes(new Set(targets.nodeIds));
            setHighlightEdges(new Set(targets.edgeIds));
        },
        []
    );

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
        setShapeResult(prev => {
            if (JSON.stringify(prev) === JSON.stringify(result)) return prev;
            return result;
        })
        if (!result.ok) {
            console.warn("Shape validation failures:", result.failures);
        }
        if (!shapeResult || !shapeResult.shapes) return;
        skipHistory.current = true;
        setNodes(currentNodes => {
            let hasChanges = false;
            const nextNodes = currentNodes.map(n => {
                const shapeEntry = result.shapes[n.id];
                const newShapeArray = shapeEntry ? shapeEntry.defaultShape : undefined;
                const currentShapeArray = (n.data as any).__shape as number[] | undefined;
                const isSame = (() => {
                    if (currentShapeArray === newShapeArray) return true;
                    if (!currentShapeArray || !newShapeArray) return false;
                    if (currentShapeArray.length !== newShapeArray.length) return false;
                    return currentShapeArray.every((val, index) => val === newShapeArray[index]);
                })();
                if (isSame) return n;
                hasChanges = true;
                return {
                    ...n,
                    data: { ...n.data, __shape: newShapeArray }
                };

            })
            return hasChanges ? nextNodes : currentNodes;
        })
    }, [nodes, edges, setNodes]);
    // useEffect(() => {
    //     const result = verifyShapes(nodes, edges);
    //     setShapeResult(result);
    //     if (!result.ok) {
    //         console.warn("Shape validation failures:", result.failures);
    //     }
    // }, [nodes, edges]);

    // useEffect(() => {
    //     if (!shapeResult || !shapeResult.shapes) return;
    //     skipHistory.current = true;
    //     setNodes(prev => {
    //         let changed = false;
    //         const next = prev.map(n => {
    //             const newShape = shapeResult.shapes[n.id];
    //             if (!newShape) return n;
    //             const oldShape = (n.data as any).__shape as number[] | undefined;
    //             const same =
    //                 Array.isArray(oldShape) &&
    //                 Array.isArray(newShape) &&
    //                 oldShape.length === newShape.length &&
    //                 oldShape.every((v, i) => v === newShape[i]);
    //             if (same) return n;
    //             changed = true;
    //             return { ...n, data: { ...n.data, __shape: newShape } };
    //         });
    //         return changed ? next : prev;
    //     });
    // }, [shapeResult, setNodes]);

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

    const highlightedEdges = useMemo(() => {
        if (!highlightEdges.size) return decoratedEdges;
        return decoratedEdges.map(e => {
            if (!highlightEdges.has(e.id)) return e;
            return {
                ...e,
                data: {
                    ...(e as any).data,
                    highlight: true
                }
            };
        });
    }, [decoratedEdges, highlightEdges]);

    const nodesForFlow = useMemo(() => {
        if (!highlightNodes.size) return nodes;
        return nodes.map(n => (highlightNodes.has(n.id) ? { ...n, data: { ...n.data, __highlight: true } } : n));
    }, [nodes, highlightNodes]);


    return (
        <div style={{ display: "flex", height: "100vh" }}>
            <div
                style={{
                    width: sidebarCollapsed ? 28 : sidebarWidth,
                    transition: dragSidebar ? "none" : "width 0.15s",
                    background: "#484444",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    position: "relative"
                }}
            >
                {sidebarCollapsed ? (
                    <button
                        onClick={() => setSidebarCollapsed(false)}
                        style={{
                            width: "100%",
                            height: "100%",
                            writingMode: "vertical-rl",
                            background: "#1f8ecd",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                            fontWeight: 700
                        }}
                        title="Expand sidebar"
                    >
                        Show Nodes
                    </button>
                ) : (
                    <Sidebar
                        onGenerateCode={onGenerateCode}
                        codePanelOpen={showLiveCode}
                        onCollapse={() => setSidebarCollapsed(true)}
                    />
                )}
            </div>
            <div
                onMouseDown={() => setDragSidebar(true)}
                style={{
                    width: 6,
                    cursor: "col-resize",
                    background: dragSidebar ? "#64ffda55" : "#2a2a2a",
                    borderRight: "1px solid #222"
                }}
                title="Drag to resize sidebar"
            />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
                <div
                    style={{
                        padding: "8px",
                        display: "flex",
                        gap: "12px",
                        alignItems: "center",
                        minHeight: "40px",
                        justifyContent: "space-between",
                        position: "sticky",
                        top: 0,
                        zIndex: 5,
                        background: "#1a1a1a"
                    }}
                >
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                            className="nodrag"
                            onClick={handleUndo}
                            disabled={!canUndo}
                            style={{
                                padding: "6px 10px",
                                background: canUndo ? "#333" : "#222",
                                color: canUndo ? "#fff" : "#666",
                                border: "1px solid #444",
                                borderRadius: 6,
                                cursor: canUndo ? "pointer" : "not-allowed"
                            }}
                        >
                            Undo
                        </button>
                        <button
                            className="nodrag"
                            onClick={handleRedo}
                            disabled={!canRedo}
                            style={{
                                padding: "6px 10px",
                                background: canRedo ? "#333" : "#222",
                                color: canRedo ? "#fff" : "#666",
                                border: "1px solid #444",
                                borderRadius: 6,
                                cursor: canRedo ? "pointer" : "not-allowed"
                            }}
                        >
                            Redo
                        </button>
                    </div>
                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            minHeight: "32px",
                            maxHeight: "120px",
                            overflowY: "auto",
                            padding: "4px 0"
                        }}
                    >
                        {shapeResult && shapeResult.ok && (
                            <span style={{ color: "#64ffda" }}>
                                Shapes valid ({Object.keys(shapeResult.shapes).length} nodes). Graph is consistent.
                            </span>
                        )}
                        {shapeResult && !shapeResult.ok && shapeResult.failures.length > 0 && (
                            <ol style={{ margin: 0, paddingLeft: "16px", color: "#ff6b6b", lineHeight: 1.4 }}>
                                {shapeResult.failures.map((f, idx) => (
                                    <li key={`${f.nodeId}-${idx}`} style={{ marginBottom: 2 }}>
                                        {friendlyError(f)}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>

                <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: "0 0 0 0" }}>
                        <ReactFlow
                            nodes={nodesForFlow}
                            edges={highlightedEdges}
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
            </div>
            {showLiveCode && (
                <>
                    <div
                        onMouseDown={() => setDragCodePanel(true)}
                        style={{
                            width: 6,
                            cursor: "col-resize",
                            background: dragCodePanel ? "#64ffda55" : "#2a2a2a",
                            borderLeft: "1px solid #222"
                        }}
                        title="Drag to resize code panel"
                    />
                    <div
                        style={{
                            width: codePanelWidth,
                            height: "100vh",
                            background: "#0f1115",
                            borderLeft: "1px solid #222",
                            display: "flex",
                            flexDirection: "column",
                            boxShadow: "0 0 20px rgba(0,0,0,0.35)",
                            position: "relative",
                            zIndex: 5
                        }}
                    >
                        <div
                            style={{
                                padding: "12px 14px",
                                borderBottom: "1px solid #222",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                background: "#12141a"
                            }}
                        >
                            <span style={{ color: "#e6edf3", fontWeight: 600 }}>Live PyTorch Code</span>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button
                                    onClick={() => navigator.clipboard.writeText(generatedCode)}
                                    style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer" }}
                                >
                                    Copy
                                </button>
                                <button
                                    onClick={onDownloadCode}
                                    style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer" }}
                                >
                                    Download
                                </button>
                                <button
                                    onClick={() => setShowLiveCode(false)}
                                    style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer" }}
                                >
                                    Collapse
                                </button>
                            </div>
                        </div>
                        <CodeViewer
                            code={generatedCode}
                            spans={generated.spans}
                            onSelectionChange={handleSelectionTargets}
                            style={{
                                flex: 1,
                                margin: 0,
                                padding: 16,
                                overflow: "auto",
                                background: "#0b0d10",
                                color: "#d4d4d4",
                                fontSize: 13,
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                lineHeight: 1.5
                            }}
                        />
                    </div>
                </>
            )}
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
