import { addEdge, useReactFlow, type Edge, type Node, type OnConnect, type ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    assignParent,
    findBestParent,
    getAbsolutePosition,
    syncContainerData,
    useContainerSystem,
    DEFAULT_CONTAINER_CONFIG,
} from "../../../utils/containerLogic";
import { getActiveModule, updateActiveModule, type OpenModule } from "../../../utils/stackNavigation";
import { getId } from "../utils/idUtils";

type UseGraphInteractionProps = {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    moduleStack: OpenModule[];
    setModuleStack: React.Dispatch<React.SetStateAction<OpenModule[]>>;
};

export function useGraphInteraction({
    nodes,
    edges,
    setNodes,
    setEdges,
    moduleStack,
    setModuleStack,
}: UseGraphInteractionProps) {
    const { getNodes } = useReactFlow();

    // Refs for Flow Instances (needed for drag-and-drop coordinate conversion)
    // We export these so the UI can attach them via `onInit`
    const mainFlowRef = useRef<ReactFlowInstance | null>(null);
    const moduleFlowRef = useRef<ReactFlowInstance | null>(null);

    const { onNodeDragStart, onNodeDragStop, assignParent } = useContainerSystem(nodes, edges, setNodes, getNodes);
    const moduleDragStartRef = useRef<Node | null>(null);
    const onModuleNodeDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
        moduleDragStartRef.current = JSON.parse(JSON.stringify(node));
    }, []);

    const onModuleNodeDragStop = useCallback(
        (_event: React.MouseEvent, node: Node) => {
            setModuleStack(stack =>
                updateActiveModule(stack, currentModule => {
                    const currentNodes = currentModule.nodes;
                    const config = DEFAULT_CONTAINER_CONFIG; // specific config may be passed in future
                    // Check Revert Logic
                    const targetParent = findBestParent(node, currentNodes, config);
                    if (targetParent) {
                        // If capacity full, revert to start state
                        const maxCap = config.capacities[targetParent.type || ""] || 999;
                        const existingChildren = currentNodes.filter(
                            n => n.parentId === targetParent.id && n.id !== node.id,
                        );
                        if (existingChildren.length >= maxCap) {
                            // Hardcoded capacity check for now
                            if (moduleDragStartRef.current && moduleDragStartRef.current.id === node.id) {
                                const revertedNode = moduleDragStartRef.current;
                                moduleDragStartRef.current = null;
                                return {
                                    ...currentModule,
                                    nodes: currentNodes.map(n => (n.id === node.id ? revertedNode : n)),
                                };
                            }
                        }
                    }

                    // Apply Parenting Logic using the helper
                    const finalNode = assignParent(node, currentNodes, config);
                    moduleDragStartRef.current = null;

                    return {
                        ...currentModule,
                        nodes: currentNodes.map(n => (n.id === node.id ? finalNode : n)),
                    };
                }),
            );
        },
        [setModuleStack],
    );
    useEffect(() => {
        const active = getActiveModule(moduleStack);
        if (!active) return;
        const result = syncContainerData(active.nodes, active.edges);
        if (result.hasChanges) {
            setModuleStack(stack =>
                updateActiveModule(stack, curr => ({
                    ...curr,
                    nodes: result.nodes,
                })),
            );
        }
    }, [moduleStack, setModuleStack]);
    const onConnect: OnConnect = useCallback(
        connection => {
            setEdges(eds => {
                const sameSource = eds.filter(
                    e => e.source === connection.source && e.sourceHandle === connection.sourceHandle,
                );
                const suffix = sameSource.length ? `_dup${sameSource.length}` : "";
                const labelBase = connection.source
                    ? `out_${connection.source}${connection.sourceHandle ? `_${connection.sourceHandle}` : ""}${suffix}`
                    : "out";
                return addEdge(
                    {
                        ...connection,
                        type: "custom",
                        data: {
                            label: labelBase,
                        },
                    },
                    eds,
                );
            });
        },
        [setEdges],
    );

    // -------------------------------------------------------------------------
    // 2. Drag & Drop Logic
    // -------------------------------------------------------------------------
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    }, []);

    const onMainDrop = useCallback(
        (event: React.DragEvent) => {
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
            const newNode: Node = {
                id: getId(),
                type,
                position,
                data: moduleMeta ? { ...moduleMeta, label: moduleMeta.name ?? "Module" } : {},
            };
            const finalNode = assignParent(newNode, getNodes());
            setNodes(nds => [...nds, finalNode]);
        },
        [setNodes, getNodes],
    );

    const onModuleDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            event.stopPropagation();

            if (!moduleFlowRef.current) return;

            const type = event.dataTransfer.getData("application/reactflow");
            if (!type) return;

            const moduleMetaRaw = event.dataTransfer.getData("application/module-meta");
            let moduleMeta: any = null;

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
                          label: typeof moduleMeta.name === "string" ? moduleMeta.name : "Module",
                      }
                    : {},
            };

            setModuleStack(stack =>
                updateActiveModule(stack, current => {
                    const finalNode = assignParent(newNode, current.nodes);
                    return {
                        ...current,
                        nodes: [...current.nodes, finalNode],
                    };
                }),
            );
        },
        [setModuleStack, assignParent],
    );

    const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
    const [highlightEdges, setHighlightEdges] = useState<Set<string>>(new Set());

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
        [setNodes, setEdges],
    );

    const clearSelection = useCallback(() => {
        setHighlightNodes(new Set());
        setHighlightEdges(new Set());
        setNodes(nds => nds.map(n => ({ ...n, selected: false, data: { ...(n.data || {}), __highlight: undefined } })));
        setEdges(eds => eds.map(e => ({ ...e, selected: false })));
    }, [setNodes, setEdges]);

    // Derived selections
    const selectedNodeIds = useMemo(() => nodes.filter(n => n.selected).map(n => n.id), [nodes]);
    return {
        mainFlowRef,
        moduleFlowRef,
        onConnect,
        onDragOver,
        onMainDrop,
        onModuleDrop,
        highlightNodes,
        setHighlightNodes,
        highlightEdges,
        setHighlightEdges,
        onSelectionChange,
        clearSelection,
        selectedNodeIds,
        onNodeDragStop,
        onNodeDragStart,
        onModuleNodeDragStart,
        onModuleNodeDragStop,
        assignParent,
    };
}
