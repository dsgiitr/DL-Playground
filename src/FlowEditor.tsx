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
    type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeViewer from "./components/CodeViewer.tsx";
import DiagramView from "./components/DiagramView";
import DiagnosticsPanel from "./components/DiagnosticsPanel";
import ComputePanel from "./components/ComputePanel";
import EditorHeader from "./components/HeaderUtils";
import TraceView from "./components/TraceView";
import Sidebar from "./Sidebar.tsx";
import { edgeTypes } from "./types/edgeTypes";
import type { GraphIR } from "./types/graph";
import { LAYER_REGISTRY, nodeTypes } from "./types/nodeTypes";
import type { TraceResponse } from "./types/trace";
import { exportDiagramDataUrl } from "./utils/diagramExport";
import { useRepeatSystem } from "./utils/repeatLogic";
// import { generatePyTorchCode } from "./utils/dummy_generator.ts";
import { generateMainCode } from "./utils/codeCompile";
import { applyGraphIR, buildGraphIR, getRootGraph } from "./utils/graphIR";
import { deleteModule, getModule, listModules, saveModule, saveExistingModule, resolveModuleName, type ModuleHandles, type SavedModule } from "./utils/moduleRegistry";
import { getActiveModule, popModule, pushModule, updateActiveModule, type OpenModule } from "./utils/stackNavigation";
import { buildShapeComparisons, compareTraceShapes } from "./utils/traceAnalysis";
import { estimateGraphCost } from "./utils/computeEstimator";
import { verifyShapes, type ShapeFailure, type ShapeResult } from "./utils/shape_verifier";
import { runTorchLensTrace } from "./utils/traceService";

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

const TRACE_SEED_PRESETS = [42, 1337, 1234, 2020, 2021];

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
    const [moduleStack, setModuleStack] = useState<OpenModule[]>([]);
    const openModule = getActiveModule(moduleStack);
    const [showModuleDiagram, setShowModuleDiagram] = useState(false);
    const moduleFlowRef = useRef<ReactFlowInstance | null>(null);
    const [shapeResult, setShapeResult] = useState<ShapeResult | null>(null);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [pendingModuleName, setPendingModuleName] = useState("");
    const [pendingVariables, setPendingVariables] = useState<Record<string, FieldSpec>>({});
    const [paramToVariableMap, setParamToVariableMap] = useState<Record<string, string>>({});
    const [moduleNameInput, setModuleNameInput] = useState("");  //this takes editable module input when updating
    const [showModuleSaveMenu, setShowModuleSaveMenu] = useState(false); // this is used to show the dropdown for saving changes

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
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [showComputePanel, setShowComputePanel] = useState(false);
    const [showTrace, setShowTrace] = useState(false);
    const [traceData, setTraceData] = useState<TraceResponse | null>(null);
    const [traceLoading, setTraceLoading] = useState(false);
    const [traceError, setTraceError] = useState<string | null>(null);
    const [traceSeedPreset, setTraceSeedPreset] = useState("42");
    const [traceSeedCustom, setTraceSeedCustom] = useState("");
    const shapeComparisons = useMemo(
        () => (traceData ? buildShapeComparisons(traceData, shapeResult, edges, nodes, LAYER_REGISTRY) : []),
        [traceData, shapeResult, edges, nodes]
    );
    const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
    const historyIndexRef = useRef(0);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const isRestoring = useRef(false);
    const skipHistory = useRef(false);
    const { screenToFlowPosition, getNodes, fitView } = useReactFlow();

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
    // Temporary swap to validate behaviour before debugging
    // const generated = useMemo(() => generatePyTorchCode(nodes, edges), [nodes, edges]);
    const generated = useMemo(() => {
        const { rootNodes, rootEdges } = getRootGraph(nodes, edges);
        return generateMainCode(rootNodes, rootEdges);
    }, [nodes, edges]);
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
    const { onNodeDragStop, assignParent } = useRepeatSystem(nodes, edges, setNodes, getNodes);

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
                // width: 150,
                // height: 50,
                data: moduleMeta
                    ? {
                        ...moduleMeta,
                        label: typeof moduleMeta.name === "string" ? moduleMeta.name : "Module",
                    }
                    : {},
            };
            const finalNode = assignParent(newNode, getNodes())

            setNodes(nds => [...nds, finalNode]);
        },
        [screenToFlowPosition, setNodes, assignParent, getNodes]
    );
    
    // Code to handle Repeat Blocks
    const onSelectionChange = useCallback(
        (params: { nodes: Node[]; edges: Edge[] }) => {
            const selectedNodeIdsFromParam = new Set(params.nodes.map(n => n.id));
            const selectedEdgeIdsFromParam = new Set(params.edges.map(e => e.id));

            setNodes(nds => {
                return nds.map(n => {
                    const isSelected = selectedNodeIdsFromParam.has(n.id);
                    return {
                        ...n,
                        selected: isSelected,
                        data: { ...(n.data || {}), __highlight: isSelected ? true : undefined },
                    };
                });
            });

            setEdges(eds => {
                return eds.map(e => {
                    return {
                        ...e,
                        selected: selectedEdgeIdsFromParam.has(e.id),
                    };
                });
            });
        },
        []
    );
    const clearSelection = useCallback(() => {
        setHighlightNodes(new Set());
        setHighlightEdges(new Set());
        setNodes(nds => nds.map(n => ({ ...n, selected: false, data: { ...(n.data || {}), __highlight: undefined } })));
        setEdges(eds => eds.map(e => ({ ...e, selected: false })));
    }, [setNodes, setEdges]);

    const selectedNodeIds = useMemo(() => nodes.filter(n => n.selected).map(n => n.id), [nodes]);
    const selectedEdgeIds = useMemo(() => edges.filter(e => e.selected).map(e => e.id), [edges]);

    useEffect(() => {
        const handler = (ev: Event) => {
            const custom = ev as CustomEvent<{ moduleId?: string; nodeId?: string, data?: ModuleRefData }>;
            const moduleId = custom.detail?.moduleId;
            if (!moduleId) return;
            const mod = getModule(moduleId);
            if (!mod) {
                alert("Module not found");
                return;
            }

            const moduleRefData = custom.detail?.data || {};
            const { nodes: rawNodes, edges: rawEdges } = applyGraphIR(mod.graph);

            const nodesWithVars = rawNodes.map(n => {
                let nodeData = n.data || {};
                if (mod.variableMap) {
                    for (const varName in mod.variableMap) {
                        const targets = mod.variableMap[varName];
                        for (const target of targets) {
                            if (target.nodeId === n.id) {
                                if (moduleRefData[varName] !== undefined) {
                                    nodeData = { ...nodeData, [target.paramName]: moduleRefData[varName] };
                                }
                            }
                        }
                    }
                }
                return { ...n, data: nodeData, selected: false };
            });


            const appliedRaw =
                mod.internalNodes && mod.internalEdges
                    ? { nodes: mod.internalNodes, edges: mod.internalEdges }
                    : applyGraphIR(mod.graph);
            const applied = {
                nodes: nodesWithVars.map(n => ({ ...n, selected: false, data: { ...(n.data || {}), __highlight: undefined } })),
                edges: rawEdges.map(e => ({ ...e, selected: false })),
            };

            if (!applied.nodes.length) {
                alert("Saved module is empty. Try saving it again after selecting nodes.");
                return;
            }
            setModuleStack(stack =>
                pushModule(stack, {
                    module: mod,
                    nodes: applied.nodes,
                    edges: applied.edges,
                    fromNodeId: custom.detail?.nodeId,
                })
            );
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

    useEffect(() => {
        setModuleNameInput(openModule?.module?.name || "");
    }, [openModule?.module?.name]);

    // this is used when the save as existing module is selected 
    const saveExistingModuleChanges = useCallback(() => {
        if (!openModule) return;
        const result = saveExistingModule(openModule, moduleNameInput, nodes);
        setNodes(result.updatedNodes);
        setModules(listModules());
        alert("Module saved");
        setModuleStack(popModule);
    }, [openModule, moduleNameInput, nodes, setNodes]);
  
    // creates a brand‑new module from the edited nodes/edges
    const saveModuleAsNew = useCallback(() => {
        if (!openModule) return;
        const updatedGraph = buildGraphIR(openModule.nodes, openModule.edges);
        const baseName = resolveModuleName(moduleNameInput, openModule.module.name);
        const newName = baseName === openModule.module.name ? `${baseName} Copy` : baseName;
        saveModule({
            name: newName,
            version: "v1",
            graph: updatedGraph,
            handles: openModule.module.handles,
            internalNodes: openModule.nodes,
            internalEdges: openModule.edges,
            description: openModule.module.description,
        });
        setModules(listModules());
        alert("Module saved as new");
        setModuleStack(popModule);
    }, [openModule, moduleNameInput]);

    const computeModuleHandles = useCallback(
        (selectedIds: Set<string>): ModuleHandles => {
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
        const selectedIdsArr = selectedNodeIds;
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

        const variableMap: Record<string, Array<{ nodeId: string; paramName: string }>> = {};
        for (const paramKey in paramToVariableMap) {
            const varName = paramToVariableMap[paramKey];
            if (varName) {
                if (!variableMap[varName]) {
                    variableMap[varName] = [];
                }
                const [nodeId, paramName] = paramKey.split("::");
                variableMap[varName].push({ nodeId, paramName });
            }
        }

        const contract = computeContract(selectedIds);
        const handles = computeModuleHandles(selectedIds);
        const moduleGraph = buildGraphIR(selectedNodes, internalEdges);
        saveModule({
            name,
            version: "v1",
            graph: moduleGraph,
            handles,
            internalNodes: selectedNodes,
            internalEdges,
            description: `Saved from ${selectedNodes.length} node(s)`,
            variableSchema: pendingVariables,
            variableMap,
        });
        setModules(listModules());
        setShowSaveModal(false);
    }, [nodes, edges, computeModuleHandles, selectedNodeIds, pendingModuleName]);

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
    const verificationResult = useMemo(() => {
        return verifyShapes(nodes, edges, LAYER_REGISTRY);
    }, [nodes, edges]);
    useEffect(() => {
        setShapeResult(prev => {
            const prevStr = JSON.stringify(prev);
            const nextStr = JSON.stringify(verificationResult);
            return prevStr === nextStr ? prev : verificationResult
        })
        if (!verificationResult.ok) {
            console.warn("Shape validation Failures:", verificationResult.failures);
        }
    }, [verificationResult]);

    useEffect(() => {
        if (!verificationResult.shapes) return;
        setNodes(currentNodes => {

            const deepEqual = (a: any, b: any): boolean => {
                if (a === b) return true;
                if (!Array.isArray(a) || !Array.isArray(b)) return false;
                if (a.length != b.length) return false;
                for (let i = 0; i < a.length; i++) {
                    if (Array.isArray(a[i]) && Array.isArray(b[i])) {
                        if (!deepEqual(a[i], b[i])) return false;
                    } else if (a[i] !== b[i]) {
                        return false;
                    }
                }
                return true
            }
            let hasChanges = false;
            const nextNodes = currentNodes.map(n => {
                const shapeEntry = verificationResult.shapes[n.id];
                const newShapeArray = shapeEntry ? shapeEntry.defaultShape : undefined;
                const currentShapeArray =
                    n.data && typeof n.data === "object" ? (n.data as { __shape?: number[] }).__shape : undefined;
                const isSame = deepEqual(currentShapeArray, newShapeArray)
                if (isSame) return n;
                hasChanges = true;
                return {
                    ...n,
                    data: { ...n.data, __shape: newShapeArray }
                };

            })
            return hasChanges ? nextNodes : currentNodes;
        })
    }, [verificationResult, setNodes]);

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

    const selectedNodes = useMemo(() => nodes.filter(n => selectedNodeIds.includes(n.id)), [nodes, selectedNodeIds]);

    const promotableParams = useMemo(() => {
        return selectedNodes.flatMap(node => {
            const layerDef = LAYER_REGISTRY[node.type!];
            if (!layerDef) return [];
            return Object.keys(layerDef.paramSchema).map(paramName => ({
                nodeId: node.id,
                nodeLabel: layerDef.label,
                paramName,
                spec: layerDef.paramSchema[paramName],
            }));
        });
    }, [selectedNodes]);
    const failureCount = shapeResult?.failures?.length ?? 0;
    const computeSummary = useMemo(
        () => estimateGraphCost(nodes, edges, shapeResult, LAYER_REGISTRY),
        [nodes, edges, shapeResult]
    );

    const toggleDiagnostics = useCallback(() => {
        setShowDiagnostics(open => {
            const next = !open;
            if (next) setShowComputePanel(false);
            return next;
        });
    }, []);

    const toggleComputePanel = useCallback(() => {
        setShowComputePanel(open => {
            const next = !open;
            if (next) setShowDiagnostics(false);
            return next;
        });
    }, []);

    const focusFailure = useCallback(
        (failure: ShapeFailure) => {
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
                {/* Selection summary is intentionally omitted; selection is shown via highlights. */}
                <EditorHeader
                    canUndo={canUndo}
                    canRedo={canRedo}
                    canSaveModule={selectedNodeIds.length > 0}
                    traceLoading={traceLoading}
                    traceSeedOptions={[...TRACE_SEED_PRESETS.map(String), "custom"]}
                    traceSeedPreset={traceSeedPreset}
                    traceSeedCustom={traceSeedCustom}
                    showCustomSeedInput={traceSeedPreset === "custom"}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onTrace={handleTrace}
                    onTraceSeedPresetChange={setTraceSeedPreset}
                    onTraceSeedCustomChange={setTraceSeedCustom}
                    onSaveModule={() => {
                        const selectedIdsArr = selectedNodeIds;
                        if (!selectedIdsArr.length) {
                            alert("Select at least one node to save as a module.");
                            return;
                        }
                        const suggestion = `Module ${modules.length + 1}`;
                        setPendingModuleName(suggestion);
                        setShowSaveModal(true);
                    }}
                    onImportJson={triggerUpload}
                    onDiagramView={() => setShowDiagram(true)}
                    onExportToggle={() => setExportMenuOpen(open => !open)}
                    onExportSvg={() => exportDiagram("svg")}
                    onExportPng={() => exportDiagram("png")}
                    onExportJson={() => {
                        downloadGraphJson();
                        setExportMenuOpen(false);
                    }}
                    exportMenuOpen={exportMenuOpen}
                    exporting={!!exporting}
                    showDiagnostics={showDiagnostics}
                    showComputePanel={showComputePanel}
                    failureCount={failureCount}
                    onToggleDiagnostics={toggleDiagnostics}
                    onToggleComputePanel={toggleComputePanel}
                    statusSlot={
                        shapeResult && shapeResult.ok ? (
                            <div
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "4px 10px",
                                    borderRadius: 999,
                                    border: "1px solid #1f2a2f",
                                    background: "linear-gradient(90deg, #0f2d2f, #0b3b2f)",
                                    color: "#7fffd4",
                                    fontWeight: 600,
                                    fontSize: 12,
                                    letterSpacing: "0.01em",
                                    boxShadow: "0 0 0 1px rgba(100, 255, 218, 0.12)",
                                }}
                            >
                                <span aria-hidden="true">✓</span>
                                <span>All clear</span>
                                <span style={{ color: "#a7f3d0", fontWeight: 500 }}>
                                    ({Object.keys(shapeResult.shapes).length} nodes)
                                </span>
                            </div>
                        ) : shapeResult && !shapeResult.ok ? (
                            <span style={{ color: "#f97316", fontWeight: 600 }}>{failureCount} issue(s) detected</span>
                        ) : null
                    }
                    selectionSummary={null}
                />

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
                    {/* load DiagnosticsPanel */}
                    {showDiagnostics && shapeResult && !shapeResult.ok && failureCount > 0 && (
                        <DiagnosticsPanel
                            failures={shapeResult.failures}
                            onSelect={focusFailure}
                            onClose={() => setShowDiagnostics(false)}
                        />
                    )}
                    {showComputePanel && (
                        <ComputePanel
                            summary={computeSummary}
                            onSelect={node => {
                                setHighlightNodes(new Set([node.nodeId]));
                                setHighlightEdges(new Set());
                                const target = nodes.find(n => n.id === node.nodeId);
                                if (target) {
                                    void fitView({ nodes: [target], padding: 0.4 });
                                }
                            }}
                            onHover={nodeId => {
                                if (!nodeId) {
                                    setHighlightNodes(new Set());
                                    setHighlightEdges(new Set());
                                    return;
                                }
                                setHighlightNodes(new Set([nodeId]));
                                setHighlightEdges(new Set());
                            }}
                            onClose={() => setShowComputePanel(false)}
                        />
                    )}
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
                            minWidth: 420,
                            maxWidth: 560,
                            maxHeight: "80vh",
                            padding: 16,
                            boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
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
                        <label style={{ color: "#cbd5e1", fontSize: 13, display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
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
                        <div style={{ borderTop: "1px solid #333", paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                            <div style={{flexShrink: 0}}>
                                <h3 style={{ color: "#cbd5e1", fontSize: 14, margin: "0 0 10px" }}>Module Variables</h3>
                                {Object.entries(pendingVariables).map(([varName, spec]) => (
                                    <div key={varName} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                        <input
                                            type="text"
                                            value={varName}
                                            // onChange={e => handleRenameVariable(varName, e.target.value)}
                                            style={{
                                                background: "#111",
                                                border: "1px solid #333",
                                                borderRadius: 4,
                                                padding: "4px 6px",
                                                color: "#e6edf3",
                                                fontSize: 12,
                                            }}
                                        />
                                        <span style={{color: '#888', fontSize: 12}}>{spec.type}</span>
                                        <button onClick={() => {
                                            const newVars = { ...pendingVariables };
                                            delete newVars[varName];
                                            setPendingVariables(newVars);
                                            // also remove from mappings
                                            const newMap = { ...paramToVariableMap };
                                            for (const key in newMap) {
                                                if (newMap[key] === varName) {
                                                    delete newMap[key];
                                                }
                                            }
                                            setParamToVariableMap(newMap);
                                        }} style={{marginLeft: 'auto', background: '#333', border: '1px solid #555', color: '#ddd', borderRadius: 4, fontSize: 10}}>Delete</button>
                                    </div>
                                ))}
                                <button onClick={() => {
                                    const newVarName = `var${Object.keys(pendingVariables).length + 1}`;
                                    setPendingVariables({ ...pendingVariables, [newVarName]: { type: 'number', required: true } });
                                }} style={{ background: '#333', border: '1px solid #555', color: '#ddd', borderRadius: 4, fontSize: 10, padding: '4px 8px' }}>Add Variable</button>
                            </div>
                            <div style={{ borderTop: "1px solid #333", paddingTop: 12, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                                <h3 style={{ color: "#cbd5e1", fontSize: 14, margin: "0 0 10px", flexShrink: 0 }}>Parameter Mappings</h3>
                                <div style={{ overflowY: "auto", paddingRight: 10 }}>
                                    {promotableParams.map(({ nodeId, nodeLabel, paramName, spec }) => {
                                        const key = `${nodeId}::${paramName}`;
                                        const assignedVar = paramToVariableMap[key];
                                        return (
                                            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>

                                                <span style={{ color: "#e6edf3", fontSize: 12, flex: 1 }}>{nodeLabel}: {spec.label || paramName}</span>
                                                <select
                                                    value={assignedVar || ""}
                                                    onChange={e => {
                                                        const newVar = e.target.value;
                                                        setParamToVariableMap(map => ({...map, [key]: newVar}));
                                                        // if this is the first time a var is used, adopt the spec
                                                        if (newVar && !pendingVariables[newVar]) {
                                                            setPendingVariables(vars => ({...vars, [newVar]: spec}));
                                                        }
                                                    }}
                                                    style={{
                                                        background: "#111",
                                                        border: "1px solid #333",
                                                        borderRadius: 4,
                                                        padding: "4px 6px",
                                                        color: "#e6edf3",
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    <option value="">Not Linked</option>
                                                    {Object.keys(pendingVariables).map(varName => (
                                                         <option key={varName} value={varName}>{varName}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4, flexShrink: 0 }}>
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
                                    onClick={() => setShowModuleSaveMenu(open => !open)}
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
                    shapeComparisons={shapeComparisons}
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
