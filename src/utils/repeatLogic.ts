import { type Edge, type Node } from "@xyflow/react";
import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
// Helper to calculate absolute position (Pure function)
const getAbsolutePosition = (node: Node, nodes: Node[]): { x: number; y: number } => {
    if (!node.parentId) return node.position;
    const parent = nodes.find(p => p.id === node.parentId);
    if (!parent) return node.position;
    const parentAbs = getAbsolutePosition(parent, nodes);
    return {
        x: parentAbs.x + node.position.x,
        y: parentAbs.y + node.position.y,
    };
};

// BUG: placing a repeat layer into another repeat layer is still very buggy.
// TODO: fix the recursive nature of repeat layers into repeat layers.

export function useRepeatSystem(
    nodes: Node[],
    edges: Edge[],
    setNodes: Dispatch<SetStateAction<Node[]>>,
    getNodes: () => Node[]
) {
    // 1. PARENT ASSIGNMENT LOGIC: Take a node and return its relative position and parentID
    const assignParent = useCallback((node: Node, currentNodes: Node[]): Node => {
        const nodeAbsPos = getAbsolutePosition(node, currentNodes);

        // Calculate Hit Box
        const nodeWidth = node.measured?.width ?? node.width ?? 0;
        const nodeHeight = node.measured?.height ?? node.height ?? 0;
        const nodeCenter = {
            x: nodeAbsPos.x + nodeWidth / 2,
            y: nodeAbsPos.y + nodeHeight / 2,
        };

        // Find Target Parent
        const targetParent = currentNodes.find(parent => {
            if (parent.id === node.id) return false;
            if (parent.type !== "repeat_layer") return false;

            const pWidth = parent.measured?.width ?? parent.width ?? 0;
            const pHeight = parent.measured?.height ?? parent.height ?? 0;
            const parentAbs = getAbsolutePosition(parent, currentNodes);

            return (
                nodeCenter.x >= parentAbs.x &&
                nodeCenter.x <= parentAbs.x + pWidth &&
                nodeCenter.y >= parentAbs.y &&
                nodeCenter.y <= parentAbs.y + pHeight
            );
        });

        if (targetParent) {
            const parentAbs = getAbsolutePosition(targetParent, currentNodes);
            return {
                ...node,
                parentId: targetParent.id,
                extent: "parent",
                position: {
                    x: nodeAbsPos.x - parentAbs.x,
                    y: nodeAbsPos.y - parentAbs.y,
                },
            };
        } else {
            return {
                ...node,
                parentId: undefined,
                extent: undefined,
                position: { ...nodeAbsPos },
            };
        }
    }, []);
    // 2. DRAG LOGIC: Handles parenting and array reordering
    const onNodeDragStop = useCallback(
        (_event: React.MouseEvent, node: Node) => {
            const currentNodes = getNodes();
            setNodes(nds => {
                const processedNode = assignParent(node, currentNodes);
                const isSameParent = processedNode.parentId === node.parentId;
                if (isSameParent) {
                    return nds.map(n => (n.id === node.id ? processedNode : n));
                }
                const otherNodes = nds.filter(n => n.id !== node.id);
                return [...otherNodes, processedNode];
            });
        },
        [getNodes, setNodes, assignParent]
    );

    // 3. SYNC LOGIC: Updates the 'childCount' and internal graph data safely
    useEffect(() => {
        const repeatParents = nodes.filter(n => n.type === "repeat_layer");
        if (repeatParents.length === 0) return;
        let hasChanges = false;
        const nextNodes = nodes.map(node => {
            if (node.type !== "repeat_layer") return node;
            const children = nodes.filter(child => child.parentId === node.id);
            const childIds = new Set(children.map(c => c.id));
            const internalEdges = edges.filter(e => {
                const isSourceChild = childIds.has(e.source);
                const isTargetChild = childIds.has(e.target);
                const isSourceParent = e.source === node.id;
                const isTargetParent = e.target === node.id;
                if (isSourceChild && isTargetChild) return true;
                if (isSourceParent && isTargetChild) return true;
                if (isSourceChild && isTargetParent) return true;
                return false;
            });

            const getTopologySig = (nodeList: Node[], edgeList: Edge[]) => {
                const nodeSig = nodeList
                    .map(n => n.id)
                    .sort()
                    .join("|");
                const edgeSig = edgeList
                    .map(e => `${e.id}:${e.sourceHandle}:${e.targetHandle}`)
                    .sort()
                    .join("|");
                return `${nodeSig}::${edgeSig}`;
            };
            const getDataSig = (nodeList: Node[]) => {
                return nodeList
                    .sort((a, b) => a.id.localeCompare(b.id))
                    .map(n => {
                        const d = n.data || {};
                        const { internalNodes, internalEdges, __highlight, __shape, ...stableData } = d;
                        const stableString = JSON.stringify(stableData, Object.keys(stableData).sort());
                        return `${n.id}.${stableString}`;
                    })
                    .join("||");
            };
            const graphTopologySig = getTopologySig(children, internalEdges);
            const graphDataSig = getDataSig(children);
            const currentData = (node.data || {}) as { internalNodes?: Node[]; internalEdges?: Edge[] };
            const storedTopologySig = getTopologySig(currentData.internalNodes || [], currentData.internalEdges || []);
            const storedDataSig = getDataSig(currentData.internalNodes || []);
            if (graphTopologySig === storedTopologySig && graphDataSig === storedDataSig) return node;

            hasChanges = true;
            return {
                ...node,
                data: {
                    ...currentData,
                    internalNodes: children,
                    internalEdges: internalEdges,
                },
            };
        });
        if (hasChanges) {
            setNodes(nextNodes);
        }
    }, [nodes, edges, setNodes]);

    return { onNodeDragStop, assignParent };
}
