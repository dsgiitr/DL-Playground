import type { Edge, Node } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";

export type LayoutDirection = "LR" | "TB";

const elk = new ELK();

type SizeLike = {
    measured?: { width?: number; height?: number };
    width?: number;
    height?: number;
    style?: { width?: number | string; height?: number | string };
};

function toNumber(val: unknown, fallback: number): number {
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "string") {
        const parsed = Number(val);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}

function getNodeSize(n: Node & SizeLike) {
    // Prefer measured sizes from React Flow; fallback to width/height or style hints.
    const w = n.measured?.width ?? n.width ?? n.style?.width ?? 220;
    const h = n.measured?.height ?? n.height ?? n.style?.height ?? 110;
    return { width: toNumber(w, 220), height: toNumber(h, 110) };
}

function handleSideFromId(handleId: string, isLR: boolean, isSource: boolean) {
    const lower = handleId.toLowerCase();
    if (lower.includes("left")) return "WEST";
    if (lower.includes("right")) return "EAST";
    if (lower.includes("top") || lower.includes("up")) return "NORTH";
    if (lower.includes("bottom") || lower.includes("down")) return "SOUTH";
    if (lower.includes("in")) return isLR ? "WEST" : "NORTH";
    if (lower.includes("out")) return isLR ? "EAST" : "SOUTH";
    return isLR ? (isSource ? "EAST" : "WEST") : isSource ? "SOUTH" : "NORTH";
}

// Preserve the chronological / flow order for layered layout so diagrams read left-to-right like the model graph.
function orderNodesByFlow(nodes: Node[], edges: Edge[]) {
    const inDegree = new Map<string, number>();
    const outgoing = new Map<string, Set<string>>();

    nodes.forEach(n => {
        inDegree.set(n.id, 0);
        outgoing.set(n.id, new Set());
    });

    edges.forEach(e => {
        if (!outgoing.has(e.source) || !inDegree.has(e.target)) return;
        outgoing.get(e.source)?.add(e.target);
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    });

    const queue: string[] = [];
    inDegree.forEach((deg, id) => {
        if (deg === 0) queue.push(id);
    });

    const ordered: string[] = [];
    while (queue.length) {
        const id = queue.shift()!;
        ordered.push(id);
        outgoing.get(id)?.forEach(next => {
            const deg = (inDegree.get(next) || 0) - 1;
            inDegree.set(next, deg);
            if (deg === 0) queue.push(next);
        });
    }

    // If graph has cycles, fall back to original order for remaining nodes.
    if (ordered.length < nodes.length) {
        nodes.forEach(n => {
            if (!ordered.includes(n.id)) ordered.push(n.id);
        });
    }

    const orderIndex = new Map<string, number>();
    ordered.forEach((id, idx) => orderIndex.set(id, idx));
    return nodes.slice().sort((a, b) => (orderIndex.get(a.id) || 0) - (orderIndex.get(b.id) || 0));
}

function buildElkGraph(nodes: Node[], edges: Edge[], direction: LayoutDirection = "LR") {
    const isLR = direction === "LR";

    // Collect handles per node from edges; fallback to one in/one out.
    const nodeHandles = new Map<string, Set<string>>();
    edges.forEach(e => {
        const sourceHandle = `${e.source}__${e.sourceHandle || "out"}`;
        const targetHandle = `${e.target}__${e.targetHandle || "in"}`;
        nodeHandles.set(e.source, (nodeHandles.get(e.source) || new Set()).add(sourceHandle));
        nodeHandles.set(e.target, (nodeHandles.get(e.target) || new Set()).add(targetHandle));
    });

    nodes.forEach(n => {
        if (!nodeHandles.has(n.id)) {
            // ensure at least one input/output so ELK can anchor edges.
            nodeHandles.set(n.id, new Set([`${n.id}__in`, `${n.id}__out`]));
        }
    });

    const orderedNodes = orderNodesByFlow(nodes, edges);

    return {
        isLR,
        graph: {
            id: "root",
            layoutOptions: {
                "elk.algorithm": "layered",
                "elk.direction": isLR ? "RIGHT" : "DOWN",
                "elk.separateConnectedComponents": "true",
                "elk.layered.considerModelOrder": "true",
                "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
                "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
                "elk.spacing.nodeNode": "50",
                "elk.layered.spacing.nodeNodeBetweenLayers": "120",
                "elk.spacing.edgeNode": "30",
                "elk.spacing.componentComponent": "160",
                "elk.edgeRouting": "SPLINES",
                "elk.portConstraints": "FIXED_ORDER",
            },
            children: orderedNodes.map((n, idx) => {
                const { width, height } = getNodeSize(n);
                const handles = Array.from(nodeHandles.get(n.id) || []).map(handleId => ({
                    id: handleId,
                    properties: {
                        "elk.port.side": handleSideFromId(handleId, isLR, handleId.includes("__out")),
                    },
                }));
                return {
                    id: n.id,
                    width,
                    height,
                    properties: {
                        // Respect the topological / input order when laying out layers.
                        "elk.layered.priority": idx.toString(),
                    },
                    ports: handles,
                };
            }),
            edges: edges.map(e => {
                const sourceHandle = `${e.source}__${e.sourceHandle || "out"}`;
                const targetHandle = `${e.target}__${e.targetHandle || "in"}`;
                return {
                    id: e.id,
                    sources: [sourceHandle],
                    targets: [targetHandle],
                };
            }),
        }
    };
}

export async function layoutWithElk(nodes: Node[], edges: Edge[], direction: LayoutDirection = "LR") {
    const { graph } = buildElkGraph(nodes, edges, direction);
    const res = await elk.layout(graph);
    const positions = new Map<string, { x: number; y: number }>();
    res.children?.forEach(child => {
        if (typeof child.x === "number" && typeof child.y === "number") {
            positions.set(child.id, { x: child.x, y: child.y });
        }
    });

    return nodes.map(node => {
        const pos = positions.get(node.id);
        if (!pos) return node;
        return {
            ...node,
            position: { x: pos.x, y: pos.y },
        };
    });
}

export async function layoutDiagramWithElk(nodes: Node[], edges: Edge[], direction: LayoutDirection = "LR") {
    const { graph } = buildElkGraph(nodes, edges, direction);
    const res = await elk.layout(graph);
    const nodeMap = new Map<string, { x: number; y: number; width: number; height: number }>();
    res.children?.forEach(child => {
        if (typeof child.x === "number" && typeof child.y === "number" && child.width && child.height) {
            nodeMap.set(child.id, { x: child.x, y: child.y, width: child.width, height: child.height });
        }
    });

    const diagramEdges = (res.edges || []).map(e => {
        const sections = (e.sections || []).map(sec => {
            const points = [
                ...(sec.startPoint ? [sec.startPoint] : []),
                ...(sec.bendPoints || []),
                ...(sec.endPoint ? [sec.endPoint] : []),
            ];
            return points;
        });
        return { id: e.id, sections, data: (edges.find(ed => ed.id === e.id)?.data) as Record<string, unknown> | undefined };
    });

    const inferKind = (label?: string) => {
        const lower = (label || "").toLowerCase();
        if (lower.includes("input")) return "input";
        if (lower.includes("output")) return "output";
        if (lower.includes("add") || lower.includes("merge") || lower.includes("concat")) return "merge";
        if (lower.includes("relu") || lower.includes("gelu") || lower.includes("sigmoid") || lower.includes("tanh")) return "activation";
        if (lower.includes("conv") || lower.includes("linear") || lower.includes("dense") || lower.includes("attention") || lower.includes("lstm") || lower.includes("gru")) return "block";
        return "other";
    };

    return {
        width: res.width ?? 1200,
        height: res.height ?? 800,
        nodes: nodes.map(n => {
            const pos = nodeMap.get(n.id);
            const { width, height } = getNodeSize(n);
            const data = (n.data || {}) as { label?: string; kind?: string };
            const label = data.label ?? n.type ?? n.id;
            const kind = data.kind ?? inferKind(label);
            return {
                id: n.id,
                label,
                kind,
                x: pos?.x ?? 0,
                y: pos?.y ?? 0,
                width: pos?.width ?? width,
                height: pos?.height ?? height,
            };
        }),
        edges: diagramEdges,
    };
}
