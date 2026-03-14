import {
    applyEdgeChanges,
    applyNodeChanges,
    type Edge,
    type Node,
    type OnEdgesChange,
    type OnNodesChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphIR } from "../../../types/graph";
import { applyGraphIR, buildGraphIR } from "../../../utils/graphIR";
import { syncIdFromNodes } from "../utils/idUtils";

export function useGraphState() {
    // -------------------------------------------------------------------------
    // 1. Storage & Initialization
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // 2. React Flow Callbacks
    // -------------------------------------------------------------------------
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

    const deleteEdgeById = useCallback((edgeId: string) => {
        setEdges(eds => eds.filter(e => e.id !== edgeId));
    }, [setEdges]);

    // Attach helper callbacks to edges so custom edge UI can remove them cleanly.
    // NOTE: This might cause re-renders if not handled carefully, but it copies original logic.
    const edgesWithHandlers = useMemo(() => {
        return edges.map(e => ({
            ...e,
            data: {
                ...(typeof e.data === "object" && e.data !== null ? e.data : {}),
                onDelete: deleteEdgeById,
            },
        }));
    }, [edges, deleteEdgeById]);

    // -------------------------------------------------------------------------
    // 3. History (Undo/Redo)
    // -------------------------------------------------------------------------
    const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
    const historyIndexRef = useRef(0);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const isRestoring = useRef(false);
    const skipHistory = useRef(false);

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

    useEffect(() => {
        if (!historyRef.current.length) {
            historyRef.current = [cloneSnapshot(nodes, edges)];
            historyIndexRef.current = 0;
            syncIdFromNodes(nodes);
            setCanUndo(false);
            setCanRedo(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync to localStorage and History on every change
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

    // Drop orphaned edges
    useEffect(() => {
        const nodeIds = new Set(nodes.map(n => n.id));
        setEdges(eds => {
            const nextEds = eds.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
            if (nextEds.length === eds.length) return eds;
            return nextEds;
        });
    }, [nodes, setEdges]);

    return {
        nodes,
        setNodes,
        edges,
        setEdges,
        onNodesChange,
        onEdgesChange,
        canUndo,
        canRedo,
        handleUndo,
        handleRedo,
        edgesWithHandlers
    };
}
