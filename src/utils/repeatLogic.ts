import { type Edge, type Node } from "@xyflow/react";
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

// Add any new control flow nodes here.
const CONTAINER_TYPES = new Set(["repeat_layer", "module_list"]);
const CONTAINER_CAPACITIES: Record<string, number> = {
    module_list: 1,
    repeat_layer: 999,
};
// 1. Calculate Absolute Position (Recursive)
// climbs the tree to find the true screen coordinates.
const getAbsolutePosition = (node: Node, nodes: Node[]): { x: number; y: number } => {
    if (!node.parentId) return node.position;

    const parent = nodes.find(p => p.id === node.parentId);
    if (!parent) return node.position; // Orphaned case safety

    const parentAbs = getAbsolutePosition(parent, nodes);
    return {
        x: parentAbs.x + node.position.x,
        y: parentAbs.y + node.position.y,
    };
};

// 2. Check Lineage
// Returns true if 'possibleChild' is actually a parent/grandparent of 'target'
// Used to prevent a parent being dropped into its own child.
const isAncestor = (ancestorId: string, targetNode: Node, nodes: Node[]): boolean => {
    if (!targetNode.parentId) return false;
    if (targetNode.parentId === ancestorId) return true;

    const parent = nodes.find(n => n.id === targetNode.parentId);
    if (!parent) return false;

    return isAncestor(ancestorId, parent, nodes);
};

// 3. Topology Signature (For preventing infinite loops in useEffect)
// Creates a hash of the current graph structure to check if React state needs updates.
const getTopologySig = (nodeList: Node[], edgeList: Edge[]) => {
    const nodeSig = nodeList
        .map(n => n.id)
        .sort()
        .join("|");
    const edgeSig = edgeList
        .map(e => `${e.id}:${e.source}:${e.target}`)
        .sort()
        .join("|");
    return `${nodeSig}::${edgeSig}`;
};

const getDataSig = (nodeList: Node[]) => {
    return nodeList
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(n => {
            const d = n.data || {};
            // Exclude large objects or UI flags to prevent render loops
            const { internalNodes, internalEdges, __highlight, ...stableData } = d;
            const stableString = JSON.stringify(stableData, Object.keys(stableData).sort());
            return `${n.id}.${stableString}`;
        })
        .join("||");
};

export function useRepeatSystem(
    nodes: Node[],
    edges: Edge[],
    setNodes: Dispatch<SetStateAction<Node[]>>,
    getNodes: () => Node[],
) {
    // 1. PARENT ASSIGNMENT LOGIC
    const dragStartRef = useRef<Node | null>(null);
    const onNodeDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
        dragStartRef.current = JSON.parse(JSON.stringify(node));
    }, []);

    const findBestParent = useCallback((node: Node, currentNodes: Node[]): Node | undefined => {
        // A. Calculate the Dragged Node's Absolute Geometry
        const nodeAbsPos = getAbsolutePosition(node, currentNodes);
        const nodeWidth = node.measured?.width ?? node.width ?? 0;
        const nodeHeight = node.measured?.height ?? node.height ?? 0;

        // Use center point for hit testing (feels more intuitive than top-left)
        const nodeCenter = {
            x: nodeAbsPos.x + nodeWidth / 2,
            y: nodeAbsPos.y + nodeHeight / 2,
        };

        // B. Find All Potential Parents
        const candidates = currentNodes.filter(potentialParent => {
            // 1. Must be a Container
            if (!CONTAINER_TYPES.has(potentialParent.type || "")) return false;

            // 2. Cannot be itself
            if (potentialParent.id === node.id) return false;

            // 3. Cannot be a child of the dragged node (Cycle Prevention)
            // If I am dragging "Outer Loop", I cannot drop it into "Inner Loop".
            if (isAncestor(node.id, potentialParent, currentNodes)) return false;

            // 4. Hit Test (Absolute Coordinates)
            const pWidth = potentialParent.measured?.width ?? potentialParent.width ?? 0;
            const pHeight = potentialParent.measured?.height ?? potentialParent.height ?? 0;
            const parentAbs = getAbsolutePosition(potentialParent, currentNodes);

            return (
                nodeCenter.x >= parentAbs.x &&
                nodeCenter.x <= parentAbs.x + pWidth &&
                nodeCenter.y >= parentAbs.y &&
                nodeCenter.y <= parentAbs.y + pHeight
            );
        });

        // C. Select the Best Parent (The "Smallest Fit" Rule)
        // If we are over both "Outer Layer" and "Inner Layer", "Inner" is smaller.
        // We pick "Inner".
        if (candidates.length === 0) return undefined;

        return candidates.sort((a, b) => {
            const areaA = (a.measured?.width ?? 0) * (a.measured?.height ?? 0);
            const areaB = (b.measured?.width ?? 0) * (b.measured?.height ?? 0);
            return areaA - areaB; // Ascending sort: Smallest area first
        })[0];
    }, []);
    const assignParent = useCallback(
        (node: Node, currentNodes: Node[]): Node => {
            const targetParent = findBestParent(node, currentNodes);

            if (targetParent) {
                // 1. Check Capacity for new drops
                const maxCap = CONTAINER_CAPACITIES[targetParent.type || ""] || 999;
                const existingChildren = currentNodes.filter(n => n.parentId === targetParent.id);

                if (existingChildren.length >= maxCap) {
                    // Capacity full: Drop as orphan on canvas instead
                    return {
                        ...node,
                        parentId: undefined,
                        extent: undefined,
                        // Position is already absolute for new drops
                    };
                }

                // 2. Adopt Child
                const parentAbs = getAbsolutePosition(targetParent, currentNodes);
                // Ensure input node position is treated as absolute
                const nodeAbs = node.parentId ? getAbsolutePosition(node, currentNodes) : node.position;

                return {
                    ...node,
                    parentId: targetParent.id,
                    extent: "parent",
                    position: {
                        x: nodeAbs.x - parentAbs.x,
                        y: nodeAbs.y - parentAbs.y,
                    },
                };
            }

            return { ...node, parentId: undefined, extent: undefined };
        },
        [findBestParent],
    );
    // 2. DRAG LOGIC
    const onNodeDragStop = useCallback(
        (_event: React.MouseEvent, node: Node) => {
            // We must use getNodes() here to ensure we have the latest positions
            // of ALL nodes, not just the one being dragged.
            const currentNodes = getNodes();
            const targetParent = findBestParent(node, currentNodes);
            setNodes(nds => {
                if (!targetParent) {
                    const nodeAbsPos = getAbsolutePosition(node, currentNodes);
                    return nds.map(n =>
                        n.id === node.id
                            ? {
                                  ...n,
                                  parentId: undefined,
                                  extent: undefined,
                                  position: nodeAbsPos,
                              }
                            : n,
                    );
                }
                const maxCap = CONTAINER_CAPACITIES[targetParent.type || ""] || 999;
                const existingChildren = currentNodes.filter(n => n.parentId === targetParent.id && n.id !== node.id);
                if (existingChildren.length >= maxCap) {
                    console.warn(
                        `Parent ${targetParent.id} is full (${existingChildren.length}/${maxCap}). Reverting.`,
                    );
                    if (dragStartRef.current && dragStartRef.current.id === node.id) {
                        return nds.map(n => (n.id === node.id ? dragStartRef.current! : n));
                    }
                    return nds;
                }
                const parentAbs = getAbsolutePosition(targetParent, currentNodes);
                const nodeAbsPos = getAbsolutePosition(node, currentNodes);
                const newNode: Node = {
                    ...node,
                    parentId: targetParent.id,
                    extent: "parent",
                    position: {
                        x: nodeAbsPos.x - parentAbs.x,
                        y: nodeAbsPos.y - parentAbs.y,
                    },
                };
                return nds.map(n => (n.id === node.id ? newNode : n));
            });
            dragStartRef.current = null;
        },
        [getNodes, setNodes, findBestParent],
    );

    // 3. SYNC LOGIC (Handles internal graph data for compilation)
    useEffect(() => {
        // Filter for ANY container type
        const containerNodes = nodes.filter(n => CONTAINER_TYPES.has(n.type || ""));

        if (containerNodes.length === 0) return;

        let hasChanges = false;

        const nextNodes = nodes.map(node => {
            if (!CONTAINER_TYPES.has(node.type || "")) return node;

            // Find immediate children
            const children = nodes.filter(child => child.parentId === node.id);
            const childIds = new Set(children.map(c => c.id));

            // Find edges relevant to this container scope
            // (Edges between two children, OR edges between container-boundary and a child)
            const internalEdges = edges.filter(e => {
                const isSourceChild = childIds.has(e.source);
                const isTargetChild = childIds.has(e.target);
                const isSourceParent = e.source === node.id; // e.g. "in-internal" handle
                const isTargetParent = e.target === node.id; // e.g. "out-internal" handle

                // Fully internal: Child -> Child
                if (isSourceChild && isTargetChild) return true;
                // Boundary In: Parent -> Child
                if (isSourceParent && isTargetChild) return true;
                // Boundary Out: Child -> Parent
                if (isSourceChild && isTargetParent) return true;

                return false;
            });

            // Check for changes to prevent infinite React loops
            const graphTopologySig = getTopologySig(children, internalEdges);
            const graphDataSig = getDataSig(children);

            const currentData = (node.data || {}) as { internalNodes?: Node[]; internalEdges?: Edge[] };
            const storedTopologySig = getTopologySig(currentData.internalNodes || [], currentData.internalEdges || []);
            const storedDataSig = getDataSig(currentData.internalNodes || []);

            if (graphTopologySig === storedTopologySig && graphDataSig === storedDataSig) {
                return node;
            }

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

    return { onNodeDragStop, onNodeDragStart, assignParent };
}
