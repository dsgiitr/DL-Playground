import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import React, { useMemo, useRef } from "react";

// Components
import DiagramView from "./components/DiagramView";
import DiagnosticsPanel from "./components/DiagnosticsPanel";
import ComputePanel from "./components/ComputePanel";
import TraceView from "./components/TraceView";
import { EditorToolbar } from "./features/editor/components/EditorToolbar";
import { EditorSidebar } from "./features/editor/components/EditorSidebar";
import { CodePanel } from "./features/editor/components/CodePanel";
import { SaveModuleModal } from "./features/editor/components/SaveModuleModal";
import { SaveCopyModal } from "./features/editor/components/SaveCopyModal";
import { ModuleEditorOverlay } from "./features/editor/components/ModuleEditorOverlay";
import { DuplicateModuleWarning } from "./features/editor/components/DuplicateModuleWarning";
import { EditorCanvas } from "./features/editor/components/EditorCanvas";

// Hooks
import { useGraphState } from "./features/editor/hooks/useGraphState";
import { useModuleSystem } from "./features/editor/hooks/useModuleSystem";
import { useGraphInteraction } from "./features/editor/hooks/useGraphInteraction";
import { useGraphLayout } from "./features/editor/hooks/useGraphLayout";
import { useTraceSystem } from "./features/editor/hooks/useTraceSystem";
import { useCodeGeneration } from "./features/editor/hooks/useCodeGeneration";
import { useExportSystem } from "./features/editor/hooks/useExportSystem";
import { LAYER_REGISTRY } from "./types/nodeTypes";
import { estimateGraphCost } from "./utils/computeEstimator";

const TRACE_SEED_PRESETS = [42, 1337, 1234, 2020, 2021];

function FlowContent() {
    // 1. Core Graph State
    const {
        nodes, setNodes,
        edges, setEdges,
        onNodesChange, onEdgesChange,
        canUndo, canRedo, handleUndo, handleRedo,
        edgesWithHandlers
    } = useGraphState();

    // 2. Code Generation
    const { generated, generatedCode, onDownloadCode } = useCodeGeneration(nodes, edges);

    // 3. Layout & UI State
    const layout = useGraphLayout();

    // 4. Trace & Analysis
    const trace = useTraceSystem({
        nodes,
        edges,
        setNodes,
        generatedCode
    });

    // 5. Module System
    const modSys = useModuleSystem({ nodes, edges, setNodes, getNodeSchema: (type) => LAYER_REGISTRY[type]?.paramSchema });

    // 6. Interaction (Drag/Drop, Selection)
    const interaction = useGraphInteraction({
        nodes,
        edges,
        setNodes,
        setEdges,
        moduleStack: modSys.moduleStack,
        setModuleStack: modSys.setModuleStack
    });

    const {
        mainFlowRef, moduleFlowRef,
        onMainDrop, onModuleDrop, onDragOver,
        highlightNodes, highlightEdges, setHighlightNodes, setHighlightEdges,
        onSelectionChange, clearSelection, selectedNodeIds,
        onConnect, onNodeDragStop, onNodeDragStart, onModuleNodeDragStart, onModuleNodeDragStop
    } = interaction;

    // Derived States for Visualization
    const decoratedEdges = useMemo(() => {
        return trace.getDecoratedEdges(edgesWithHandlers);
    }, [edgesWithHandlers, trace.getDecoratedEdges]);

    const highlightedEdgesList = useMemo(() => {
        if (!highlightEdges.size) return decoratedEdges;
        let hasChanges = false;
        const newEdges = decoratedEdges.map(e => {
            const isHighlighted = highlightEdges.has(e.id);
            const data = (e.data && typeof e.data === "object") ? e.data as Record<string, unknown> : {};
            const currentlyHighlighted = !!data.highlight;
            if (isHighlighted === currentlyHighlighted) return e;
            hasChanges = true;
            return { ...e, data: { ...data, highlight: isHighlighted ? true : undefined } };
        });
        return hasChanges ? newEdges : decoratedEdges;
    }, [decoratedEdges, highlightEdges]);
    const { exportJson, exportPng, exportSvg, isExporting } = useExportSystem({ 
        nodes, 
        edges,
        modules: modSys.modules
    });
    const nodesForFlow = useMemo(() => {
        if (!highlightNodes.size) {
            // Check if any node currently has __highlight and remove it
            let hasChanges = false;
            const newNodes = nodes.map(n => {
                if (n.data && n.data.__highlight) {
                    hasChanges = true;
                    return { ...n, data: { ...n.data, __highlight: undefined } };
                }
                return n;
            });
            return hasChanges ? newNodes : nodes;
        }
        
        let hasChanges = false;
        const newNodes = nodes.map(n => {
            const isHighlighted = highlightNodes.has(n.id);
            const currentlyHighlighted = !!(n.data && n.data.__highlight);
            if (isHighlighted === currentlyHighlighted) return n;
            hasChanges = true;
            return { ...n, data: { ...(n.data || {}), __highlight: isHighlighted ? true : undefined } };
        });
        return hasChanges ? newNodes : nodes;
    }, [nodes, highlightNodes]);

    const computeSummary = useMemo(() => {
        return estimateGraphCost(nodes, edges, trace.shapeResult, LAYER_REGISTRY);
    }, [nodes, edges, trace.shapeResult]);

    // Helper for generating code toggle
    const handleGenerateCode = () => layout.setShowLiveCode(v => !v);

    // File Upload (ref needed)
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const triggerUpload = () => uploadInputRef.current?.click();
    const onUploadGraph = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const parsed = JSON.parse(String(ev.target?.result));
                if (parsed.modules && Array.isArray(parsed.modules)) {
                    modSys.mergeModules(parsed.modules);
                }
                setEdges([]);
                if (parsed.nodes && parsed.edges) {
                    
                    setNodes(parsed.nodes);
                    setEdges(parsed.edges);
                }
            } catch (err) {
                console.error("Failed to import graph", err);
                alert("Failed to import graph JSON.");
            }
        };
        reader.readAsText(file);
        event.target.value = "";
    };

    return (
        <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden" }}>
            <input
                ref={uploadInputRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={onUploadGraph}
            />
            {/* Sidebar */}
            <EditorSidebar
                sidebarCollapsed={layout.sidebarCollapsed}
                sidebarWidth={layout.sidebarWidth}
                dragSidebar={layout.dragSidebar}
                setSidebarCollapsed={layout.setSidebarCollapsed}
                setDragSidebar={layout.setDragSidebar}
                onGenerateCode={handleGenerateCode}
                showLiveCode={layout.showLiveCode}
                modules={modSys.modules}
                handleDeleteModule={modSys.handleDeleteModule}
            />

            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
                <EditorToolbar
                    canUndo={canUndo}
                    canRedo={canRedo}
                    canSaveModule={selectedNodeIds.length > 0}
                    traceLoading={trace.traceLoading}
                    traceSeedOptions={[...TRACE_SEED_PRESETS.map(String), "custom"]}
                    traceSeedPreset={trace.traceSeedPreset}
                    traceSeedCustom={trace.traceSeedCustom}
                    showCustomSeedInput={trace.traceSeedPreset === "custom"}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onTrace={trace.handleTrace}
                    onTraceSeedPresetChange={trace.setTraceSeedPreset}
                    onTraceSeedCustomChange={trace.setTraceSeedCustom}
                    onSaveModule={() => {
                        if (!selectedNodeIds.length) {
                            alert("Select at least one node to save as a module.");
                            return;
                        }
                        const suggestion = `Module ${modSys.modules.length + 1}`;
                        modSys.setPendingModuleName(suggestion);
                        modSys.setShowSaveModal(true);
                    }}
                    onImportJson={triggerUpload}
                    onDiagramView={() => layout.setShowDiagram(true)}
                    onExportToggle={() => layout.setExportMenuOpen(open => !open)}
                    onExportSvg={() => { exportSvg()}}
                    onExportPng={() => { exportPng()}}
                    onExportJson={() => {exportJson()}}
                    exportMenuOpen={layout.exportMenuOpen}
                    exporting={isExporting} 
                    showDiagnostics={layout.showDiagnostics}
                    showComputePanel={layout.showComputePanel}
                    failureCount={trace.shapeResult?.failures?.length ?? 0}
                    onToggleDiagnostics={() => layout.setShowDiagnostics(v => !v)}
                    onToggleComputePanel={() => layout.setShowComputePanel(v => !v)}
                    statusSlot={
                        trace.shapeResult && trace.shapeResult.ok ? (
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
                                    ({Object.keys(trace.shapeResult.shapes).length} nodes)
                                </span>
                            </div>
                        ) : trace.shapeResult && !trace.shapeResult.ok ? (
                            <span style={{ color: "#f97316", fontWeight: 600 }}>{trace.shapeResult.failures.length} issue(s) detected</span>
                        ) : null
                    }
                    selectionSummary={null}
                />

                <EditorCanvas
                    nodesForFlow={nodesForFlow}
                    highlightedEdges={highlightedEdgesList}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeDragStop={onNodeDragStop}
                    onNodeDragStart={onNodeDragStart}
                    onMainDrop={onMainDrop}
                    onDragOver={onDragOver}
                    onSelectionChange={onSelectionChange}
                    clearSelection={clearSelection}
                    setMainFlowRef={(rf) => { mainFlowRef.current = rf; }}
                />

                {/* Panels & Overlays */}
                {layout.showDiagnostics && trace.shapeResult && !trace.shapeResult.ok && (
                    <DiagnosticsPanel
                        failures={trace.shapeResult.failures}
                        onSelect={(f) => trace.focusFailure(f, setHighlightNodes, setHighlightEdges)}
                        onClose={() => layout.setShowDiagnostics(false)}
                    />
                )}

                {modSys.moduleNameWarning && (
                    <DuplicateModuleWarning onClose={() => modSys.setModuleNameWarning(false)} />
                )}

                {layout.showComputePanel && (
                    <ComputePanel
                        summary={computeSummary}
                        onSelect={node => {
                            setHighlightNodes(new Set([node.nodeId]));
                            setHighlightEdges(new Set());
                            // fitView logic needs ref
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
                        onClose={() => layout.setShowComputePanel(false)}
                    />
                )}
            </div>

            <CodePanel
                showLiveCode={layout.showLiveCode}
                codePanelWidth={layout.codePanelWidth}
                dragCodePanel={layout.dragCodePanel}
                setDragCodePanel={layout.setDragCodePanel}
                setShowLiveCode={layout.setShowLiveCode}
                generatedCode={generatedCode}
                onDownloadCode={onDownloadCode}
                generated={generated}
                handleSelectionTargets={({ nodeIds, edgeIds }) => {
                    setHighlightNodes(new Set(nodeIds));
                    setHighlightEdges(new Set(edgeIds));
                }}
            />

            {layout.showDiagram && (
                <DiagramView
                    nodes={nodes as any}
                    edges={edges as any}
                    graph={{ nodes: nodes as any, edges: edges as any, version: 1, createdAt: new Date().toISOString() }}
                    onClose={() => layout.setShowDiagram(false)}
                />
            )}

            {modSys.showSaveModal && (
                <SaveModuleModal
                    onClose={() => modSys.setShowSaveModal(false)}
                    onSave={modSys.handleSaveModule}
                    pendingModuleName={modSys.pendingModuleName}
                    setPendingModuleName={modSys.setPendingModuleName}
                    pendingVariables={modSys.pendingVariables}
                    // setPendingVariables={modSys.setPendingVariables}
                    paramToVariableMap={modSys.paramToVariableMap}
                    // setParamToVariableMap={modSys.setParamToVariableMap}
                    promotableParams={modSys.promotableParams}
                    onAddVariable={modSys.addVariable}
                    onDeleteVariable={modSys.deleteVariable}
                    onRenameVariable={modSys.renameVariable}
                    onUpdateMapping={modSys.updateParamMapping}
                />
            )}

            {modSys.showSaveCopyModal && (
                <SaveCopyModal
                    onClose={() => modSys.setShowSaveCopyModal(false)}
                    onSave={modSys.handleReturnCopyModule}
                    pendingName={modSys.pendingModuleCopyName}
                    setPendingName={modSys.setPendingModuleCopyName}
                />
            )}

            {modSys.openModule && (
                <ModuleEditorOverlay
                    openModule={modSys.openModule}
                    setModuleStack={modSys.setModuleStack}
                    moduleFlowRef={moduleFlowRef}
                    moduleNameInput={modSys.moduleNameInput}
                    setModuleNameInput={modSys.setModuleNameInput}
                    showModuleDiagram={modSys.showModuleDiagram}
                    setShowModuleDiagram={modSys.setShowModuleDiagram}
                    showModuleSaveMenu={modSys.showModuleSaveMenu}
                    setShowModuleSaveMenu={modSys.setShowModuleSaveMenu}
                    moduleNameWarning={modSys.moduleNameWarning}
                    setModuleNameWarning={modSys.setModuleNameWarning}
                    onModuleDrop={onModuleDrop}
                    onDragOver={onDragOver}
                    saveExistingModuleChanges={modSys.saveExistingModuleChanges}
                    saveModuleAsNew={modSys.saveModuleAsNew}
                    onNodeDragStart={onModuleNodeDragStart}
                    onNodeDragStop={onModuleNodeDragStop}
                />
            )}

            {trace.showTrace && (
                <TraceView
                    trace={trace.traceData}
                    loading={trace.traceLoading}
                    error={trace.traceError}
                    shapeComparisons={trace.shapeComparisons}
                    onClose={() => trace.setShowTrace(false)}
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
// function computeContract(selectedIds: Set<string>) {
//     throw new Error("Function not implemented.");
// }
