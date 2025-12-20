import {
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    Background,
    ReactFlow,
    type ReactFlowInstance,
    ReactFlowProvider,
    useReactFlow,
    type NodeSelectionChange,
    type EdgeSelectionChange,
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
import DiagramView from "./components/DiagramView";
import { exportDiagramDataUrl } from "./utils/diagramExport";
import { buildGraphIR, applyGraphIR } from "./utils/graphIR";
import type { GraphIR } from "./types/graph";
import TraceView from "./components/TraceView";
import { runTorchLensTrace } from "./utils/traceService";
import type { TraceResponse } from "./types/trace";
import { getModule, listModules, saveModule, deleteModule, type ModuleContract, type SavedModule } from "./utils/moduleRegistry";

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

const dedupe = <T,>(arr: T[]) => Array.from(new Set(arr));

function FlowContent() {
    const [nodes, setNodes] = useState<Node[]>(() => {
        const savedGraph = localStorage.getItem("graphIR");
        if (savedGraph) {
            try {
                const parsed: GraphIR = JSON.parse(savedGraph);
                const restored = applyGraphIR(parsed);
                syncIdFromNodes(restored.nodes);
                return restored.nodes.map(n => (n.type === "input" ? { ...n, type: "input_layer" } : n));
            } catch (err) {
                console.warn("Failed to load GraphIR, falling back to nodes/edges", err);
            }
        }
        const saved = localStorage.getItem("nodes");
        if (!saved) return [];
        const parsed: Node[] = JSON.parse(saved).map((n: Node) =>
            n.type === "input" ? { ...n, type: "input_layer" } : n
        );
        syncIdFromNodes(parsed);
        return parsed;
    });
    const [edges, setEdges] = useState<Edge[]>(() => {
        const savedGraph = localStorage.getItem("graphIR");
        if (savedGraph) {
            try {
                const parsed: GraphIR = JSON.parse(savedGraph);
                const restored = applyGraphIR(parsed);
                return restored.edges;
            } catch (err) {
                console.warn("Failed to load GraphIR edges, falling back to edges", err);
            }
        }
        const saved = localStorage.getItem("edges");
        return saved ? JSON.parse(saved) : [];
    });
    const [modules, setModules] = useState<SavedModule[]>(() => listModules());
    const [selection, setSelection] = useState<{ nodeIds: string[]; edgeIds: string[] }>({ nodeIds: [], edgeIds: [] });
    const [openModule, setOpenModule] = useState<{ module: SavedModule; nodes: Node[]; edges: Edge[]; fromNodeId?: string } | null>(null);
    const [showModuleDiagram, setShowModuleDiagram] = useState(false);
    const moduleFlowRef = useRef<ReactFlowInstance | null>(null);
    const [shapeResult, setShapeResult] = useState<ShapeResult | null>(null);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [pendingModuleName, setPendingModuleName] = useState("");

    const [showLiveCode, setShowLiveCode] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(240);
    const [codePanelWidth, setCodePanelWidth] = useState(360);
    const [dragSidebar, setDragSidebar] = useState(false);
    const [dragCodePanel, setDragCodePanel] = useState(false);
    const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
    const [highlightEdges, setHighlightEdges] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState<"png" | "svg" | null>(null);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [showDiagram, setShowDiagram] = useState(false);
    const [showTrace, setShowTrace] = useState(false);
    const [traceData, setTraceData] = useState<TraceResponse | null>(null);
    const [traceLoading, setTraceLoading] = useState(false);
    const [traceError, setTraceError] = useState<string | null>(null);
    const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
    const historyIndexRef = useRef(0);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const isRestoring = useRef(false);
    const skipHistory = useRef(false);
    const { screenToFlowPosition } = useReactFlow();

    const onNodesChange: OnNodesChange = useCallback(
        changes => {
            // Drop only edges attached to nodes being removed so unrelated wiring stays intact.
            const removedIds = changes.filter(c => c.type === "remove").map(c => c.id);
            if (removedIds.length) {
                setEdges(eds => eds.filter(e => !removedIds.includes(e.source) && !removedIds.includes(e.target)));
            }
            setNodes(nds => applyNodeChanges(changes, nds));
        },
        [setNodes, setEdges]
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

    const handleTrace = useCallback(async () => {
        setTraceLoading(true);
        setTraceError(null);
        try {
            const graph = buildGraphIR(nodes, edges);
            const resp = await runTorchLensTrace({
                graph,
                inputShapes: [[1, 3, 224, 224]],
                code: generatedCode,
            });
            setTraceData(resp);
            setShowTrace(true);
        } catch (err) {
            setTraceError("Trace failed. Backend unavailable or returned error.");
            console.error("Trace failed", err);
        } finally {
            setTraceLoading(false);
        }
    }, [nodes, edges, generatedCode]);

    const deleteEdgeById = useCallback((edgeId: string) => {
        setEdges(eds => eds.filter(e => e.id !== edgeId));
    }, [setEdges]);

    // Attach helper callbacks to edges so custom edge UI can remove them cleanly.
    const edgesWithHandlers = useMemo(
        () =>
            edges.map(e => ({
                ...e,
                data: {
                    ...(typeof e.data === "object" && e.data !== null ? e.data : {}),
                    onDelete: deleteEdgeById,
                },
            })),
        [edges, deleteEdgeById]
    );

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
        const graph = buildGraphIR(nodes, edges);
        localStorage.setItem("graphIR", JSON.stringify(graph));
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

    // Drop orphaned edges that reference nodes no longer in the graph.
    useEffect(() => {
        const nodeIds = new Set(nodes.map(n => n.id));
        setEdges(eds => eds.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)));
    }, [nodes]);

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
            const moduleMetaRaw = event.dataTransfer.getData("application/module-meta");
            let moduleMeta: Record<string, unknown> | null = null;
            if (moduleMetaRaw) {
                try {
                    moduleMeta = JSON.parse(moduleMetaRaw);
                } catch (err) {
                    console.warn("Failed to parse module metadata", err);
                }
            }

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode: Node = {
                id: getId(),
                type: type,
                position,
                data: moduleMeta
                    ? {
                        ...moduleMeta,
                        label: typeof moduleMeta.name === "string" ? moduleMeta.name : "Module",
                    }
                    : {},
            };

            setNodes(nds => nds.concat(newNode));
        },
        [screenToFlowPosition, setNodes]
    );

    const onSelectionChange = useCallback(
        (params: { nodes?: NodeSelectionChange[]; edges?: EdgeSelectionChange[] }) => {
            const changedNodes = params.nodes || [];
            const changedEdges = params.edges || [];

            setNodes(nds => {
                const next = nds.map(n => {
                    const match = changedNodes.find(cn => cn.id === n.id);
                    if (!match || typeof match.selected === "undefined") return n;
                    const isSel = !!match.selected;
                    return {
                        ...n,
                        selected: isSel,
                        data: { ...(n.data || {}), __highlight: isSel ? true : undefined },
                    };
                });
                const selectedIds = next.filter(n => n.selected).map(n => n.id);
                setSelection(sel => ({ ...sel, nodeIds: selectedIds }));
                return next;
            });

            setEdges(eds => {
                const next = eds.map(e => {
                    const match = changedEdges.find(ce => ce.id === e.id);
                    if (!match || typeof match.selected === "undefined") return e;
                    return { ...e, selected: !!match.selected };
                });
                const selectedIds = next.filter(e => e.selected).map(e => e.id);
                setSelection(sel => ({ ...sel, edgeIds: selectedIds }));
                return next;
            });
        },
        []
    );
    const clearSelection = useCallback(() => {
        setSelection({ nodeIds: [], edgeIds: [] });
        setHighlightNodes(new Set());
        setHighlightEdges(new Set());
        setNodes(nds => nds.map(n => ({ ...n, selected: false, data: { ...(n.data || {}), __highlight: undefined } })));
        setEdges(eds => eds.map(e => ({ ...e, selected: false })));
    }, [setNodes, setEdges]);

    const selectedNodeIds = useMemo(() => nodes.filter(n => n.selected).map(n => n.id), [nodes]);
    const selectedEdgeIds = useMemo(() => edges.filter(e => e.selected).map(e => e.id), [edges]);

    useEffect(() => {
        const handler = (ev: Event) => {
            const custom = ev as CustomEvent<{ moduleId?: string; nodeId?: string }>;
            const moduleId = custom.detail?.moduleId;
            if (!moduleId) return;
            const mod = getModule(moduleId);
            if (!mod) {
                alert("Module not found");
                return;
            }
            const appliedRaw = applyGraphIR(mod.graph);
            const applied = {
                nodes: appliedRaw.nodes.map(n => ({
                    ...n,
                    selected: false,
                    data: { ...(n.data || {}), __highlight: undefined },
                })),
                edges: appliedRaw.edges.map(e => ({ ...e, selected: false })),
            };
            if (!applied.nodes.length) {
                alert("Saved module is empty. Try saving it again after selecting nodes.");
                return;
            }
            setOpenModule({
                module: mod,
                nodes: applied.nodes,
                edges: applied.edges,
                fromNodeId: custom.detail?.nodeId,
            });
            setShowModuleDiagram(false);
        };
        window.addEventListener("module-open", handler as EventListener);
        return () => window.removeEventListener("module-open", handler as EventListener);
    }, []);

    useEffect(() => {
        if (openModule?.nodes?.length && moduleFlowRef.current) {
            moduleFlowRef.current.fitView({ padding: 0.2, includeHiddenNodes: true });
        }
    }, [openModule?.nodes, openModule?.edges]);

    const computeContract = useCallback(
        (selectedIds: Set<string>): ModuleContract => {
            const incoming = edges.filter(e => !selectedIds.has(e.source) && selectedIds.has(e.target));
            const outgoing = edges.filter(e => selectedIds.has(e.source) && !selectedIds.has(e.target));
            return {
                inputs: dedupe(incoming.map(e => e.targetHandle || "in")),
                outputs: dedupe(outgoing.map(e => e.sourceHandle || "out")),
            };
        },
        [edges]
    );

    const handleSaveModule = useCallback(() => {
        const selectedIdsArr = selectedNodeIds.length ? selectedNodeIds : selection.nodeIds;
        if (!selectedIdsArr.length) {
            setShowSaveModal(false);
            return;
        }
        const selectedIds = new Set(selectedIdsArr);
        const selectedNodes = nodes.filter(n => selectedIds.has(n.id));
        const internalEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));
        if (!selectedNodes.length) {
            setShowSaveModal(false);
            return;
        }
        const name = pendingModuleName.trim();
        if (!name) {
            alert("Enter a module name.");
            return;
        }
        const contract = computeContract(selectedIds);
        const moduleGraph = buildGraphIR(selectedNodes, internalEdges);
        saveModule({
            name,
            version: "v1",
            graph: moduleGraph,
            contract,
            description: `Saved from ${selectedNodes.length} node(s)`,
        });
        setModules(listModules());
        setShowSaveModal(false);
        alert(`Saved module "${name}"`);
    }, [selection.nodeIds, nodes, edges, computeContract, selectedNodeIds, pendingModuleName]);

    const graphSnapshot = useMemo<GraphIR>(() => buildGraphIR(nodes, edges), [nodes, edges]);

    const exportDiagram = useCallback(
        async (format: "png" | "svg") => {
            try {
                setExporting(format);
                const { dataUrl } = await exportDiagramDataUrl(graphSnapshot, format);
                const link = document.createElement("a");
                link.href = dataUrl;
                link.download = `model-diagram-${Date.now()}.${format}`;
                link.click();
            } catch (err) {
                console.error("Export failed", err);
                alert("Failed to export diagram. Check console for details.");
            } finally {
                setExporting(null);
                setExportMenuOpen(false);
            }
        },
        [graphSnapshot]
    );

    const downloadGraphJson = useCallback(() => {
        const blob = new Blob([JSON.stringify(graphSnapshot, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `graph-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [graphSnapshot]);

    const uploadInputRef = useRef<HTMLInputElement | null>(null);

    const triggerUpload = useCallback(() => {
        if (uploadInputRef.current) uploadInputRef.current.click();
    }, []);

    const onUploadGraph = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    const parsed = JSON.parse(String(ev.target?.result)) as GraphIR;
                    const { nodes: newNodes, edges: newEdges } = applyGraphIR(parsed);
                    setNodes(newNodes);
                    setEdges(newEdges);
                } catch (err) {
                    console.error("Failed to import graph", err);
                    alert("Failed to import graph JSON.");
                }
            };
            reader.readAsText(file);
            event.target.value = "";
        },
        [setNodes, setEdges]
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
                const currentShapeArray =
                    n.data && typeof n.data === "object" ? (n.data as { __shape?: number[] }).__shape : undefined;
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
    }, [nodes, edges, setNodes, shapeResult]);
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
        if (!shapeResult || shapeResult.ok) return edgesWithHandlers;
        const failMap = new Map<string, ShapeFailure[]>();
        shapeResult.failures.forEach(f => {
            (f.upstream || []).forEach(src => {
                const key = `${src}->${f.nodeId}`;
                const arr = failMap.get(key) || [];
                arr.push(f);
                failMap.set(key, arr);
            });
        });
        return edgesWithHandlers.map(e => {
            const key = `${e.source}->${e.target}`;
            const errs = failMap.get(key);
            if (!errs || !errs.length) return e;
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
    }, [edgesWithHandlers, shapeResult, friendlyError]);

    const highlightedEdges = useMemo(() => {
        if (!highlightEdges.size) return decoratedEdges;
        return decoratedEdges.map(e => {
            if (!highlightEdges.has(e.id)) return e;
            const existingData = (e.data && typeof e.data === "object") ? e.data as Record<string, unknown> : {};
            return {
                ...e,
                data: {
                    ...existingData,
                    highlight: true
                }
            };
        });
    }, [decoratedEdges, highlightEdges]);

    const nodesForFlow = useMemo(() => {
        if (!highlightNodes.size) return nodes;
        return nodes.map(n => (highlightNodes.has(n.id) ? { ...n, data: { ...(n.data || {}), __highlight: true } } : n));
    }, [nodes, highlightNodes]);


    return (
        <div style={{ display: "flex", height: "100vh" }}>
            <input
                ref={uploadInputRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={onUploadGraph}
            />
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
                        modules={modules}
                        onDeleteModule={id => {
                            deleteModule(id);
                            setModules(listModules());
                            setNodes(nds => {
                                const remaining = nds.filter(n => {
                                    const data = (n.data || {}) as { moduleId?: string };
                                    return data.moduleId !== id;
                                });
                                const remainingIds = new Set(remaining.map(n => n.id));
                                setEdges(eds =>
                                    eds.filter(e => remainingIds.has(e.source) && remainingIds.has(e.target))
                                );
                                return remaining;
                            });
                        }}
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
                        <button
                            className="nodrag"
                            onClick={handleTrace}
                            style={{
                                padding: "6px 10px",
                                background: "#333",
                                color: "#fff",
                                border: "1px solid #444",
                                borderRadius: 6,
                                cursor: "pointer"
                            }}
                            title="Run forward trace (TorchLens backend required)"
                        >
                            {traceLoading ? "Tracing…" : "TorchLens Trace"}
                        </button>
                        <button
                            className="nodrag"
                            onClick={() => {
                                const selectedIdsArr = selectedNodeIds.length ? selectedNodeIds : selection.nodeIds;
                                if (!selectedIdsArr.length) {
                                    alert("Select at least one node to save as a module.");
                                    return;
                                }
                                const suggestion = `Module ${modules.length + 1}`;
                                setPendingModuleName(suggestion);
                                setShowSaveModal(true);
                            }}
                            disabled={!selectedNodeIds.length && !selection.nodeIds.length}
                            style={{
                                padding: "6px 10px",
                                background: selectedNodeIds.length || selection.nodeIds.length ? "#335" : "#222",
                                color: selectedNodeIds.length || selection.nodeIds.length ? "#fff" : "#666",
                                border: "1px solid #444",
                                borderRadius: 6,
                                cursor: selectedNodeIds.length || selection.nodeIds.length ? "pointer" : "not-allowed"
                            }}
                            title="Save selected nodes as a reusable module"
                        >
                            Save Module
                        </button>
                        <button
                            className="nodrag"
                            onClick={triggerUpload}
                            style={{
                                padding: "6px 10px",
                                background: "#333",
                                color: "#fff",
                                border: "1px solid #444",
                                borderRadius: 6,
                                cursor: "pointer"
                            }}
                            title="Import GraphIR JSON"
                        >
                            Import JSON
                        </button>
                        <button
                            className="nodrag"
                            onClick={() => setShowDiagram(true)}
                            style={{
                                padding: "6px 10px",
                                background: "#333",
                                color: "#fff",
                                border: "1px solid #444",
                                borderRadius: 6,
                                cursor: "pointer"
                            }}
                            title="Open paper-style diagram view"
                        >
                            Diagram View
                        </button>
                        <div style={{ position: "relative" }}>
                            <button
                                className="nodrag"
                                onClick={() => setExportMenuOpen(open => !open)}
                                style={{
                                    padding: "6px 10px",
                                    background: "#333",
                                    color: "#fff",
                                    border: "1px solid #444",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    minWidth: 110,
                                    textAlign: "left"
                                }}
                                title="Export diagram"
                            >
                                Export ▾
                            </button>
                            {exportMenuOpen && (
                                <div
                                    style={{
                                        position: "absolute",
                                        top: "110%",
                                        left: 0,
                                        background: "#1a1a1a",
                                        border: "1px solid #444",
                                        borderRadius: 6,
                                        boxShadow: "0 10px 20px rgba(0,0,0,0.35)",
                                        zIndex: 10,
                                        minWidth: 150,
                                        overflow: "hidden"
                                    }}
                                >
                                    <button
                                        onClick={() => exportDiagram("svg")}
                                        disabled={!!exporting}
                                        style={{
                                            padding: "8px 12px",
                                            width: "100%",
                                            background: "transparent",
                                            border: "none",
                                            color: exporting ? "#777" : "#e6edf3",
                                            cursor: exporting ? "not-allowed" : "pointer",
                                            textAlign: "left"
                                    }}
                                >
                                    Export as SVG
                                </button>
                                <button
                                    onClick={() => exportDiagram("png")}
                                        disabled={!!exporting}
                                        style={{
                                            padding: "8px 12px",
                                            width: "100%",
                                            background: "transparent",
                                            border: "none",
                                            color: exporting ? "#777" : "#e6edf3",
                                            cursor: exporting ? "not-allowed" : "pointer",
                                        textAlign: "left"
                                    }}
                                >
                                    Export as PNG
                                </button>
                                    <button
                                        onClick={() => {
                                            downloadGraphJson();
                                            setExportMenuOpen(false);
                                        }}
                                        style={{
                                            padding: "8px 12px",
                                            width: "100%",
                                            background: "transparent",
                                            border: "none",
                                            color: "#e6edf3",
                                            cursor: "pointer",
                                            textAlign: "left",
                                            borderTop: "1px solid #333"
                                        }}
                                    >
                                        Export JSON
                                    </button>
                                </div>
                            )}
                        </div>
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
                        <div style={{ color: "#9ca3af", fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span>Selected nodes: {selectedNodeIds.length ? selectedNodeIds.join(", ") : "none"}</span>
                            <span>Selected edges: {selectedEdgeIds.length ? selectedEdgeIds.join(", ") : "none"}</span>
                        </div>
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
                            onSelectionChange={onSelectionChange}
                            onPaneClick={clearSelection}
                            multiSelectionKeyCode="Shift"
                            selectionOnDrag
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
            {showDiagram && (
                <DiagramView
                    nodes={nodes}
                    edges={edges}
                    graph={graphSnapshot}
                    onClose={() => setShowDiagram(false)}
                />
            )}
            {showSaveModal && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.55)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 70,
                        padding: 16,
                    }}
                >
                    <div
                        style={{
                            background: "#0f1115",
                            border: "1px solid #222",
                            borderRadius: 10,
                            width: 360,
                            padding: 16,
                            boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: "#e6edf3", fontWeight: 700 }}>Save Module</span>
                            <button
                                onClick={() => setShowSaveModal(false)}
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "#888",
                                    cursor: "pointer",
                                    fontSize: 18,
                                    lineHeight: 1,
                                }}
                                title="Close"
                            >
                                ×
                            </button>
                        </div>
                        <label style={{ color: "#cbd5e1", fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
                            Module name
                            <input
                                autoFocus
                                value={pendingModuleName}
                                onChange={e => setPendingModuleName(e.target.value)}
                                style={{
                                    background: "#111",
                                    border: "1px solid #333",
                                    borderRadius: 6,
                                    padding: "8px 10px",
                                    color: "#e6edf3",
                                    fontSize: 14,
                                }}
                            />
                        </label>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                            <button
                                onClick={() => setShowSaveModal(false)}
                                style={{
                                    padding: "8px 12px",
                                    background: "#333",
                                    color: "#e6edf3",
                                    border: "1px solid #444",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                }}
                            >
                                Close
                            </button>
                            <button
                                onClick={handleSaveModule}
                                style={{
                                    padding: "8px 12px",
                                    background: "#1f8ecd",
                                    color: "#fff",
                                    border: "1px solid #1f8ecd",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    fontWeight: 600,
                                }}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {openModule && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 30,
                        padding: 20,
                    }}
                >
                    <div
                        style={{
                            background: "#0f1115",
                            border: "1px solid #222",
                            borderRadius: 10,
                            width: "92vw",
                            height: "92vh",
                            display: "flex",
                            flexDirection: "column",
                            boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
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
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <span style={{ color: "#e6edf3", fontWeight: 700 }}>
                                    Editing Module: {openModule.module.name} ({openModule.module.version})
                                </span>
                                <span style={{ color: "#9ca3af", fontSize: 12 }}>View and edit without leaving the canvas</span>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
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
                                    onClick={() => {
                                        const updated = buildGraphIR(openModule.nodes, openModule.edges);
                                        saveModule({
                                            id: openModule.module.id,
                                            name: openModule.module.name,
                                            version: openModule.module.version,
                                            graph: updated,
                                            contract: openModule.module.contract,
                                            description: openModule.module.description,
                                        });
                                        setModules(listModules());
                                        alert("Module saved");
                                        setOpenModule(null);
                                    }}
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
                                    Save
                                </button>
                                <button
                                    onClick={() => setOpenModule(null)}
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
                                        setOpenModule(curr =>
                                            curr
                                                ? { ...curr, nodes: applyNodeChanges(changes, curr.nodes) }
                                                : curr
                                        )
                                    }
                                    onEdgesChange={changes =>
                                        setOpenModule(curr =>
                                            curr
                                                ? { ...curr, edges: applyEdgeChanges(changes, curr.edges) }
                                                : curr
                                        )
                                    }
                                    onConnect={connection =>
                                        setOpenModule(curr =>
                                            curr
                                                ? {
                                                      ...curr,
                                                      edges: addEdge(
                                                          {
                                                              ...connection,
                                                              type: "custom",
                                                              data: { label: connection.source || "out" },
                                                          },
                                                          curr.edges
                                                      ),
                                                  }
                                                : curr
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
                        </div>
                    </div>
                </div>
            )}
            {openModule && showModuleDiagram && (
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
            {showTrace && (
                <TraceView
                    trace={traceData}
                    loading={traceLoading}
                    error={traceError}
                    onClose={() => setShowTrace(false)}
                    onSelect={ids => {
                        setHighlightNodes(new Set(ids));
                        setHighlightEdges(new Set());
                    }}
                />
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
