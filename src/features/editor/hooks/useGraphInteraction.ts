import {
    addEdge,
    type Edge,
    type Node,
    type OnConnect,
    type ReactFlowInstance,
    useReactFlow,
} from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { updateActiveModule, type OpenModule } from "../../../utils/stackNavigation";
import { useRepeatSystem } from "../../../utils/repeatLogic";
import { getId } from "../utils/idUtils";

type UseGraphInteractionProps = {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    setModuleStack: React.Dispatch<React.SetStateAction<OpenModule[]>>;
};

export function useGraphInteraction({
    nodes,
    edges,
    setNodes,
    setEdges,
    setModuleStack,
}: UseGraphInteractionProps) {

    // Refs for Flow Instances (needed for drag-and-drop coordinate conversion)
    // We export these so the UI can attach them via `onInit`
    const mainFlowRef = useRef<ReactFlowInstance | null>(null);
    const moduleFlowRef = useRef<ReactFlowInstance | null>(null);

    // -------------------------------------------------------------------------
    // 1. Connection Logic
    // -------------------------------------------------------------------------
    const onConnect: OnConnect = useCallback(
        connection => {
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
        },
        [setEdges]
    );

    // -------------------------------------------------------------------------
    // 2. Drag & Drop Logic
    // -------------------------------------------------------------------------
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    }, []);

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
    }, [setNodes]);

    const onModuleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();

        if (!moduleFlowRef.current) return;

        const type = event.dataTransfer.getData("application/reactflow");
        if (!type) return;

        const moduleMetaRaw = event.dataTransfer.getData("application/module-meta");
        let moduleMeta: any = null;

        try {
            if (moduleMetaRaw) moduleMeta = JSON.parse(moduleMetaRaw);
        } catch { }

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
    }, [setModuleStack]);

    // -------------------------------------------------------------------------
    // 3. Selection & Highlights
    // -------------------------------------------------------------------------
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
        [setNodes, setEdges]
    );

    const clearSelection = useCallback(() => {
        setHighlightNodes(new Set());
        setHighlightEdges(new Set());
        setNodes(nds => nds.map(n => ({ ...n, selected: false, data: { ...(n.data || {}), __highlight: undefined } })));
        setEdges(eds => eds.map(e => ({ ...e, selected: false })));
    }, [setNodes, setEdges]);

    // Derived selections
    const selectedNodeIds = useMemo(() => nodes.filter(n => n.selected).map(n => n.id), [nodes]);

    // Handle nested node dragging (Repeat Logic)
    // useReactFlow required context? No, useRepeatSystem uses getNodes() from useReactFlow 
    // inside it? The original code calls useReactFlow inside FlowContent.
    // useRepeatSystem(nodes, edges, setNodes, getNodes)
    // We need 'getNodes' from useReactFlow. 
    // BUT useReactFlow must be used inside ReactFlowProvider. 
    // FlowEditor has <ReactFlowProvider><FlowContent /></ReactFlowProvider>.
    // So this hook will be used inside FlowContent, so useReactFlow IS safe.
    const { getNodes } = useReactFlow();
    const { onNodeDragStop, assignParent } = useRepeatSystem(nodes, edges, setNodes, getNodes);

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
        assignParent, // might not be used directly by UI but needed for logic
    };
}
