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
import { recursiveCodeGenerator } from "./utils/codeCompile";
import { generateMainCode, sanitizeIdent } from "./utils/codeCompile";
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
    const mainFlowRef = useRef<ReactFlowInstance | null>(null);
    const moduleFlowRef = useRef<ReactFlowInstance | null>(null);
    const [shapeResult, setShapeResult] = useState<ShapeResult | null>(null);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showSaveCopyModal, setShowSaveCopyModal] = useState(false);
    const [pendingModuleName, setPendingModuleName] = useState("");
    const [pendingVariables, setPendingVariables] = useState<Record<string, FieldSpec>>({});
    const [paramToVariableMap, setParamToVariableMap] = useState<Record<string, string>>({});
    const [pendingModuleCopyName, setPendingModuleCopyName] = useState("");
    const [moduleNameInput, setModuleNameInput] = useState("");  //this takes editable module input when updating
    const [showModuleSaveMenu, setShowModuleSaveMenu] = useState(false); // this is used to show the dropdown for saving changes

    const [moduleNameWarning, setModuleNameWarning] = useState(false);

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
        return recursiveCodeGenerator(rootNodes, rootEdges);
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

    const onMainDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        if (!mainFlowRef.current) return;

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

        const position = mainFlowRef.current.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        setNodes(nds => [
            ...nds,
            {
        id: getId(),
            type,
            position,
            data: moduleMeta
            ? { ...moduleMeta, label: moduleMeta.name ?? "Module" }
            : {},
            },
        ]);     
}, []);

const onModuleDrop = useCallback((event: React.DragEvent) => {
  event.preventDefault();
  event.stopPropagation();

  if (!moduleFlowRef.current) return;

  const type = event.dataTransfer.getData("application/reactflow");
  if (!type) return;

  const moduleMetaRaw = event.dataTransfer.getData("application/module-meta");
  let moduleMeta = null;

  try {
    if (moduleMetaRaw) moduleMeta = JSON.parse(moduleMetaRaw);
  } catch {}

  const position = moduleFlowRef.current.screenToFlowPosition({
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
            label: typeof moduleMeta.name === "string" ? moduleMeta.name : "Module"
        }
      : {},
  };

  setModuleStack(stack =>
    updateActiveModule(stack, current => ({
      ...current,
      nodes: [...current.nodes, newNode],
    }))
  );
}, []);

    
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
                alert("Saved module is empty. You can now add new things and save changes.");
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

    // This useEffect is responsible for resetting the module name warning whenever the modal is closed or the pendingModuleName changes.                                                    │
    useEffect(() => {
        setModuleNameWarning(false);
    }, [showSaveModal, pendingModuleName, moduleNameInput, openModule]);

    // this is used when the save as existing module is selected 
    const saveExistingModuleChanges = useCallback(() => {
        setModuleNameWarning(false); // Clear previous warnings
        if (!openModule) return;

        const name = moduleNameInput.trim();
        if (!name) {
            alert("Enter a module name.");
            return;
        }

        const sanitizedName = sanitizeIdent(resolveModuleName(name, ""));
        const existingNamesExcludingCurrent = modules.filter(m => m.id !== openModule.module.id).map(m => sanitizeIdent(resolveModuleName(m.name, ""))); // Sanitization might be redundant

        if (existingNamesExcludingCurrent.includes(sanitizedName)) {
            setModuleNameWarning(true);
            return;
        }

        const result = saveExistingModule(openModule, sanitizedName, nodes);
        setNodes(result.updatedNodes);
        setModules(listModules());
        alert("Module saved");
        setModuleStack(popModule);
    }, [openModule, moduleNameInput, nodes, setNodes, modules]);
  
    // creates a brand‑new module from the edited nodes/edges
    const saveModuleAsNew = useCallback(() => {
        if (!openModule) return;
        const baseName = resolveModuleName(moduleNameInput, openModule.module.name);
        setPendingModuleCopyName(baseName)
        setShowSaveCopyModal(true);
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
    const handleReturnCopyModule = () => {
        if (!openModule) return;
        const updatedGraph = buildGraphIR(openModule.nodes, openModule.edges);
        const name = pendingModuleCopyName.trim();
        if (!name) {
            alert("Enter a module name.");
            return;
        }
        saveModule({
            name: name,
            version: "v1",
            graph: updatedGraph,
            handles: openModule.module.handles,
            internalNodes: openModule.nodes,
            internalEdges: openModule.edges,
            description: openModule.module.description,
        });
        setModules(listModules());
        alert("Module saved as new");
        setShowSaveCopyModal(false);
        setModuleStack(popModule);
    }
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
        const sanitizedName = sanitizeIdent(resolveModuleName(name, ""));
        const existingNames = modules.map(m => sanitizeIdent(resolveModuleName(m.name, ""))); // This might have redundant sanitization.
        if (existingNames.includes(sanitizedName)) {
            setModuleNameWarning(true);
            return;
        }

        const handles = computeModuleHandles(selectedIds);
        const moduleGraph = buildGraphIR(selectedNodes, internalEdges);
        saveModule({
            name: sanitizedName,
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
    }, [nodes, edges, computeModuleHandles, selectedNodeIds, pendingModuleName, modules]);

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
        <div className="flex h-screen">
            <input
                ref={uploadInputRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={onUploadGraph}
            />
            <div
                className={`shrink-0 bg-[#484444] flex flex-col overflow-hidden relative border-r border-[#222] ${
                    dragSidebar ? "transition-none" : "transition-[width] duration-150"
                }`}
                style={{ width: sidebarCollapsed ? 28 : sidebarWidth }}
            >
                
                {sidebarCollapsed ? (
                    <button
                        onClick={() => setSidebarCollapsed(false)}
                        className={`w-full h-full writing-mode-vertical-rl bg-[#1f8ecd] text-white border-none cursor-pointer font-bold`}
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
                className="w-[6px] cursor-col-resize flex-shrink-0 bg-[#2a2a2a] border-r border-[#222]"
                title="Drag to resize sidebar"
            />
            <div className="flex flex-1 flex-col relative">
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
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#1f2a2f] bg-gradient-to-r from-[#0f2d2f] to-[#0b3b2f] text-[#7fffd4] text-xs font-semibold tracking-[0.01em] shadow-[0_0_0_1px_rgba(100,255,218,0.12)]"
                            >
                                <span aria-hidden="true">✓</span>
                                <span>All clear</span>
                                <span className="text-[#a7f3d0] font-medium">
                                    ({Object.keys(shapeResult.shapes).length} nodes)
                                </span>
                            </div>
                        ) : shapeResult && !shapeResult.ok ? (
                            <span className="text-[#f97316] font-medium">{failureCount} issue(s) detected</span>
                        ) : null
                    }
                    selectionSummary={null}
                />

                <div className="flex-1 relative overflow-hidden">
                    <div className="absolute inset-0">
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
                            onInit={rf => {mainFlowRef.current = rf as any;}}
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
                    {moduleNameWarning && ( // This component is displayed when a module with the same name already exists and we expect the user to select a new name.
                        <div
                            onClick={() => setModuleNameWarning(false)}
                            className="fixed inset-0 bg-black/45 flex items-center justify-center z-1000"
                        >
                            <div
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-center z-1000"
                            >
                                <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center justify-center z-1000"
                                >
                                    <div
                                        className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-r from-red-500 to-red-600 rounded-t-lg"
                                    />

                                    <div className="font-semibold text-lg mb-6">
                                        Duplicate Module Name
                                    </div>

                                    <div className="text-sm text-gray-500 mb-6">
                                        A module with this name already exists. Please choose a different name to continue.
                                    </div>

                                    <div className="text-xs text-gray-500 mt-6">
                                        Click outside to dismiss
                                    </div>
                                </div>
                            </div>

                            <style>
                                {`
                                    @keyframes popupFade {
                                        from {
                                            opacity: 0;
                                            transform: scale(0.96);
                                        }
                                        to {
                                            opacity: 1;
                                            transform: scale(1);
                                        }
                                    }
                                `}
                            </style>
                        </div>
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
                        className="w-1 cursor-col-resize flex-shrink-0 bg-[#2a2a2a] border-l border-[#222]"
                        title="Drag to resize code panel"
                    />

                    <div
                        style={{
                            width: codePanelWidth,
                            flexShrink: 0,
                            height: "100%",
                            background: "#0f1115",
                            borderLeft: "1px solid #222",
                            display: "flex",
                            flexDirection: "column",
                            boxShadow: "0 0 20px rgba(0,0,0,0.35)",
                            position: "relative",
                            zIndex: 5
                        }}
                    >
                        <div className="px-4 py-4 bg-[#12141a] border-b border-[#222] flex justify-between items-center flex-shrink-0">
                            <span className="text-[#e6edf3] font-semibold">Live PyTorch Code</span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => navigator.clipboard.writeText(generatedCode)}
                                    className="px-2 py-1 text-xs cursor-pointer"
                                >
                                    Copy
                                </button>
                                <button
                                    onClick={onDownloadCode}
                                    className="px-2 py-1 text-xs cursor-pointer"
                                >
                                    Download
                                </button>
                                <button
                                    onClick={() => setShowLiveCode(false)}
                                    className="px-2 py-1 text-xs cursor-pointer"
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
                                padding: 4,
                                overflow: "hidden",
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
                    className="fixed inset-0 bg-black/55 flex items-center justify-center z-70 p-4"
                >
                    <div
                        className="bg-[#0f1115] border border-[#222] rounded-lg min-w-102 max-w-140 max-h-80vh p-4 shadow-2xl flex flex-col gap-3"
                    >
                        <div className="flex justify-between items-center flex-shrink-0">
                            <span className="text-[#e6edf3] font-semibold">Save Module</span>
                            <button
                                onClick={() => setShowSaveModal(false)}
                                className="bg-transparent border-none text-[#888] cursor-pointer text-lg leading-none"
                                title="Close"
                            >
                                ×
                            </button>
                        </div>
                        <label className="text-[#cbd5e1] text-sm flex flex-col gap-1.5 flex-shrink-0">
                            Module name
                            <input
                                autoFocus
                                value={pendingModuleName}
                                onChange={e => setPendingModuleName(e.target.value)}
                                className="bg-[#111] border border-[#333] rounded-md px-2.5 py-2 text-[#e6edf3] text-sm"
                            />
                        </label>
                        <div className="border-t border-[#333] pt-3 flex flex-col gap-3 min-h-0">
                            <div className="flex-shrink-0">
                                <h3 className="text-[#cbd5e1] text-sm mb-2.5">Module Variables</h3>
                                {Object.entries(pendingVariables).map(([varName, spec]) => (
                                    <div key={varName} className="flex items-center gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={varName}
                                            // onChange={e => handleRenameVariable(varName, e.target.value)}
                                            className="bg-[#111] border border-[#333] rounded-md px-2.5 py-2 text-[#e6edf3] text-sm"
                                        />
                                        <span className="text-[#888] text-xs">{spec.type}</span>
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
                                        }} className="ml-auto bg-[#333] border border-[#555] text-[#ddd] rounded-md text-xs px-2 py-1">Delete</button>
                                    </div>
                                ))}
                                <button onClick={() => {
                                    const newVarName = `var${Object.keys(pendingVariables).length + 1}`;
                                    setPendingVariables({ ...pendingVariables, [newVarName]: { type: 'number', required: true } });
                                }} className="ml-auto bg-[#333] border border-[#555] text-[#ddd] rounded-md text-xs px-2 py-1">Add Variable</button>
                            </div>
                            <div className="border-t border-[#333] pt-3 flex flex-col gap-3 min-h-0">
                                <h3 className="text-[#cbd5e1] text-sm mb-2.5">Parameter Mappings</h3>
                                <div className="overflow-y-auto pr-2">
                                    {promotableParams.map(({ nodeId, nodeLabel, paramName, spec }) => {
                                        const key = `${nodeId}::${paramName}`;
                                        const assignedVar = paramToVariableMap[key];
                                        return (
                                            <div key={key} className="flex items-center gap-2 mb-2">

                                                <span className="text-[#e6edf3] text-sm flex-1">{nodeLabel}: {spec.label || paramName}</span>
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
                                                    className="bg-[#111] border border-[#333] rounded-md px-2.5 py-2 text-[#e6edf3] text-sm"
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
                        <div className="flex justify-end gap-2 mt-1 flex-shrink-0">
                            <button
                                onClick={() => setShowSaveModal(false)}
                                className="bg-[#333] border border-[#444] text-[#e6edf3] rounded-md px-2.5 py-2 text-sm cursor-pointer"
                            >
                                Close
                            </button>
                            <button
                                onClick={handleSaveModule}
                                className="bg-[#1f8ecd] border border-[#1f8ecd] text-[#fff] rounded-md px-2.5 py-2 text-sm cursor-pointer font-semibold"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showSaveCopyModal && (
                <div
                    className="fixed inset-0 bg-black/55 flex items-center justify-center z-70 p-4"
                >
                    <div
                        className="bg-[#0f1115] border border-[#222] rounded-md w-96 p-4 shadow-lg flex flex-col gap-3"
                    >
                        <div className="flex justify-between items-center">
                            <span className="text-[#e6edf3] font-semibold">Copy Module</span>
                            <button
                                onClick={() => setShowSaveCopyModal(false)}
                                className="bg-transparent border-none text-[#888] cursor-pointer text-lg leading-none"
                                title="Close"
                            >
                                ×
                            </button>
                        </div>
                        <label className="text-[#cbd5e1] text-sm flex flex-col gap-1.5">
                            Copy Module name
                            <input
                                autoFocus
                                value={pendingModuleCopyName}
                                onChange={e => setPendingModuleCopyName(e.target.value)}
                                className="bg-[#111] border border-[#333] rounded-md px-2.5 py-2 text-[#e6edf3] text-sm"
                            />
                        </label>
                        <div className="flex justify-end gap-2 mt-1 flex-shrink-0">
                            <button
                                onClick={() => setShowSaveCopyModal(false)}
                                className="bg-[#333] border border-[#444] text-[#e6edf3] rounded-md px-2.5 py-2 text-sm cursor-pointer font-semibold"
                            >
                                Close
                            </button>
                            <button
                                onClick={handleReturnCopyModule}
                                className="bg-[#1f8ecd] border border-[#1f8ecd] text-[#fff] rounded-md px-2.5 py-2 text-sm cursor-pointer font-semibold"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {openModule && (
                <>
                    <div
                        className="fixed top-0 left-0 w-[20vw] h-[100vh] z-29 pointer-events-none"
                    />

                    <div
                        className="fixed top-0 right-0 w-[80vw] h-[100vh] z-30 p-5 pointer-events-auto"
                    >

                        <div
                        onDrop={onModuleDrop}
                        onDragOver={onDragOver}
                        className="bg-[#0f1115] border border-[#222] rounded-md w-[80vw] h-[92vh] flex flex-col gap-3 shadow-lg pointer-events-auto"
                        >
                        <div
                            className="p-2.5 border-b border-[#222] flex items-center gap-2.5 justify-between"
                        >
                            {/* editable module header to enter the updated module names  */}
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <span style={{ color: "#9ca3af", fontSize: 12 }}>Editing Module</span>
                                <input
                                    value={moduleNameInput}
                                    onChange={e => setModuleNameInput(e.target.value)}
                                    placeholder="Module name"
                                    className="bg-[#0f172a] border border-[#1f2937] rounded-md px-2.5 py-2 text-[#e6edf3] text-sm font-semibold min-w-[160px]"
                                />
                                <span className="text-[#9ca3af] text-sm">({openModule.module.version})</span>
                                <span className="text-[#9ca3af] text-sm">View and edit without leaving the canvas</span>
                            </div>
                            <div className="flex gap-2 relative">
                                <button
                                    onClick={() => setShowModuleDiagram(true)}
                                    className="px-2.5 py-2 rounded-md border border-[#444] bg-[#333] text-[#fff] cursor-pointer"
                                >
                                    Diagram View
                                </button>
                                <button
                                    onClick={() => setShowModuleSaveMenu(open => !open)}
                                    className="px-2.5 py-2 rounded-md border border-[#1f8ecd] bg-[#1f8ecd] text-[#fff] cursor-pointer font-semibold"
                                >
                                    Save ▾
                                </button>
                                {/* this shows the saving dropdown */}
                                {showModuleSaveMenu && (
                                        <div
                                            className="absolute right-0 top-full mt-1.5 bg-[#111827] border border-[#1f2937] rounded-md p-1.5 flex flex-col gap-1.5 min-w-[160px] z-5"
                                    >
                                        <button
                                            onClick={() => {
                                                setShowModuleSaveMenu(false);
                                                saveExistingModuleChanges();
                                            }}
                                            className="px-2.5 py-2 rounded-md border border-[#444] bg-[#333] text-[#fff] cursor-pointer text-sm font-semibold text-left"
                                        >
                                            Save changes
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowModuleSaveMenu(false);
                                                saveModuleAsNew();
                                            }}
                                            className="px-2.5 py-2 rounded-md border border-[#444] bg-[#333] text-[#fff] cursor-pointer text-sm"
                                        >
                                            Save as new module
                                        </button>
                                    </div>
                                )}
                                <button
                                    onClick={() => setModuleStack(popModule)}
                                    className="px-2.5 py-2 rounded-md border border-[#444] bg-[#333] text-[#fff] cursor-pointer"
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
                                    className="bg-[0b0d10]"
                                >
                                    <Background />
                                </ReactFlow>
                            </ReactFlowProvider>
                        </div>
                    </div>
                    </div>
                </>
            )}
            {openModule && showModuleDiagram && (
                <div
                    className="fixed inset-0 z-60 bg-[rgba(0,0,0,0.72)] flex items-center justify-center p-3"
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
