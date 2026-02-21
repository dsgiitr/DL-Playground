import { addEdge, useReactFlow, type Edge, type Node, type OnConnect, type ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FieldSpec } from "../../../node_gen/BaseClass";
import {
    DEFAULT_CONTAINER_CONFIG,
    findBestParent,
    syncContainerData,
    useContainerSystem,
} from "../../../utils/containerLogic";
import { LAYER_REGISTRY } from "../../../utils/layerRegistry";
import { getModule } from "../../../utils/moduleRegistry";
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
function getInitialNodeData(type: string, targetModuleId?: string): Record<string, any> {
    const initialData: Record<string, any> = {};
    const registryItem = LAYER_REGISTRY[type];
    if (registryItem && registryItem.paramSchema) {
        Object.entries(registryItem.paramSchema as Record<string, FieldSpec>).forEach(([key, spec]) => {
            if (spec.defaultValue !== undefined) {
                initialData[key] = spec.defaultValue;
            } else {
                switch (spec.type) {
                    case "number":
                        initialData[key] = 0;
                        break;
                    case "boolean":
                        initialData[key] = false;
                        break;
                    case "text":
                        initialData[key] = "";
                        break;
                    case "select":
                        initialData[key] = spec.options?.[0] || "";
                        break;
                }
            }
        });
        initialData.label = registryItem.label || type;
    }
    if (type === "module_ref" && targetModuleId) {
        const moduleDef = getModule(targetModuleId);
        if (moduleDef) {
            initialData.moduleId = moduleDef.id;
            initialData.name = moduleDef.name;
            initialData.version = moduleDef.version;
            initialData.handles = moduleDef.handles;
            initialData.description = moduleDef.description;
            initialData.label = moduleDef.name;
            if (moduleDef.variableSchema) {
                Object.entries(moduleDef.variableSchema).forEach(([key, spec]) => {
                    if (spec.defaultValue !== undefined) {
                        initialData[key] = spec.defaultValue;
                    } else {
                        switch (spec.type) {
                            case "number":
                                initialData[key] = 0;
                                break;
                            case "boolean":
                                initialData[key] = false;
                                break;
                            case "text":
                                initialData[key] = "";
                                break;
                            default:
                                initialData[key] = 0;
                        }
                    }
                });
            }
        } else {
            console.warn(`Module ID ${targetModuleId} not found in registry.`);
            initialData.label = "Unknown Module";
        }
    }
    return initialData;
}
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
                // const sameSource = eds.filter(
                //     e => e.source === connection.source && e.sourceHandle === connection.sourceHandle,
                // );
                // const suffix = sameSource.length ? `_dup${sameSource.length}` : "";
                const labelBase = connection.source
                    ? `out_${connection.source}${connection.sourceHandle ? `_${connection.sourceHandle}` : ""}`//${suffix}`
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
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    }, []);
    const createNodeFromEvent = (event: React.DragEvent, flowInstance: ReactFlowInstance | null) => {
        if (!flowInstance) return null;

        const type = event.dataTransfer.getData("application/reactflow");
        if (!type) return null;

        // Extract ID from the meta JSON
        const moduleMetaRaw = event.dataTransfer.getData("application/module-meta");
        let targetModuleId: string | undefined = undefined;

        try {
            if (moduleMetaRaw) {
                const parsed = JSON.parse(moduleMetaRaw);
                // Support both 'moduleId' and 'id' as valid identifiers
                targetModuleId = parsed.moduleId || parsed.id;
            }
        } catch (err) {
            console.warn("Failed to parse module ID from drag data", err);
        }

        const position = flowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        // Pass ID to helper, which will call getModule()
        const initialData = getInitialNodeData(type, targetModuleId);

        return {
            id: getId(),
            type,
            position,
            data: initialData,
        };
    };

    const onMainDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            const newNode = createNodeFromEvent(event, mainFlowRef.current);
            if (!newNode) return;

            const finalNode = assignParent(newNode, getNodes());
            setNodes(nds => [...nds, finalNode]);
        },
        [setNodes, getNodes],
    );

    const onModuleDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            event.stopPropagation();

            const newNode = createNodeFromEvent(event, moduleFlowRef.current);
            if (!newNode) return;

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
        [setModuleStack],
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
