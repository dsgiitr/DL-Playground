import type { Edge, Node } from "@xyflow/react";
import { LAYER_REGISTRY } from "../types/nodeTypes";

export type CodeSpan = {
    line: number;
    kind: "header" | "init" | "forward" | "return";
    nodeId?: string;
    edgeIds?: string[];
};

export type CodeGenResult = {
    code: string;
    spans: CodeSpan[];
};

// Current code doesn't work for multiple inputs. We need to add input blocks or something similar. Output blocks can also be created.
// Right now if the same output is being used by 2 blocks hence 2 protruding edges are there then the label on each edge is different, this may be changed later.
// Though this requires us that the nodes have labelled outputs and edges are not between 2 nodes but between 2 "handles"
export function generatePyTorchCode(nodes: Node[], edges: Edge[]): CodeGenResult {
    if (nodes.length === 0) return { code: "class Model(nn.Module):\n    pass", spans: [] };

    const lines: string[] = [];
    const spans: CodeSpan[] = [];
    const initLines: { text: string; span?: Omit<CodeSpan, "line"> }[] = [];
    const forwardLines: { text: string; span?: Omit<CodeSpan, "line"> }[] = [];

    // 1. Build Adjacency List
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    nodes.forEach(n => {
        adj[n.id] = [];
        inDegree[n.id] = 0;
    });
    edges.forEach(e => {
        if (adj[e.source]) adj[e.source].push(e.target);
        if (inDegree[e.target] !== undefined) inDegree[e.target]++;
    });

    // 2. Topological Sort
    const queue: string[] = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    const sortedIds: string[] = [];

    while (queue.length > 0) {
        const u = queue.shift()!;
        sortedIds.push(u);
        if (adj[u]) {
            adj[u].forEach(v => {
                inDegree[v]--;
                if (inDegree[v] === 0) queue.push(v);
            });
        }
    }

    const finalOrderIds = sortedIds.length === nodes.length ? sortedIds : nodes.map(n => n.id);
    const sortedNodes = finalOrderIds.map(id => nodes.find(n => n.id === id)!);

    // This code creates a list of all the input and output edges of a node
    const incomingEdges: Record<string, Edge[]> = {};
    const outgoingEdges: Record<string, Edge[]> = {};

    nodes.forEach(n => {
        incomingEdges[n.id] = [];
        outgoingEdges[n.id] = [];
    });

    edges.forEach(e => {
        incomingEdges[e.target]?.push(e);
        outgoingEdges[e.source]?.push(e);
    });

    // 3. Generate Code
    lines.push("import torch");
    spans.push({ line: lines.length, kind: "header" });
    lines.push("import torch.nn as nn");
    spans.push({ line: lines.length, kind: "header" });
    lines.push("");
    spans.push({ line: lines.length, kind: "header" });
    lines.push("class GeneratedModel(nn.Module):");
    spans.push({ line: lines.length, kind: "header" });
    lines.push("    def __init__(self):");
    spans.push({ line: lines.length, kind: "header" });
    lines.push("        super().__init__()");
    spans.push({ line: lines.length, kind: "header" });

    const edgeLabel = (edge: Edge, fallback: string) => {
        const lbl = (edge.data as any)?.label;
        if (typeof lbl === "string" && lbl.trim().length > 0) return lbl.trim();
        // fall back to a deterministic name based on the source node and handle
        const suffix = edge.sourceHandle ? edge.sourceHandle.replace(/[^a-zA-Z0-9_]/g, "_") : "out";
        return `${fallback}_${suffix}`;
    };

    sortedNodes.forEach((node, index) => {
        const layerName = `layer_${index}`;
        const type = node.type;

        if (type && LAYER_REGISTRY[type]) {
            const ClassRef = LAYER_REGISTRY[type];
            const line = ClassRef.getInitCode(node.data, layerName);

            initLines.push({ text: `        ${line}`, span: { kind: "init", nodeId: node.id } });

            const inEdges = incomingEdges[node.id];
            const inputNames =
                inEdges.length === 0
                    ? ["x"]
                    : inEdges.map((e, idx) => edgeLabel(e, `in_${e.source || idx}`));


            const outEdges = outgoingEdges[node.id];
            const handlesSpec = typeof ClassRef.handles === "function" ? ClassRef.handles(node.data as any) : ClassRef.handles;
            const sourceHandles = handlesSpec?.sources && handlesSpec.sources.length ? handlesSpec.sources : undefined;
            const outputNames = (sourceHandles || []).length
                ? sourceHandles.map((handleId, idx) => {
                    const matching = outEdges.find(e => e.sourceHandle === handleId);
                    return matching ? edgeLabel(matching, `out_${node.id}_${handleId}`) : `out_${node.id}_${idx}`;
                })
                : outEdges.length === 0
                    ? [`out_${node.id}`]
                    : outEdges.map((e, idx) => edgeLabel(e, `out_${node.id}_${idx}`));

            const forward_line = ClassRef.getForwardCode(
                node.data,
                layerName,
                inputNames,
                outputNames
            );

            forwardLines.push({
                text: `        ${forward_line}`,
                span: { kind: "forward", nodeId: node.id, edgeIds: outEdges.map(e => e.id) }
            });
        }
    });

    const terminalNodes = sortedNodes.filter(
        n => outgoingEdges[n.id].length === 0
    );

    if (terminalNodes.length === 1) {
        const lastOut = outgoingEdges[terminalNodes[0].id][0];
        const lastOutName = lastOut ? edgeLabel(lastOut, `out_${terminalNodes[0].id}`) : `out_${terminalNodes[0].id}`;
        forwardLines.push({
            text: `        return ${lastOutName}`,
            span: { kind: "return", nodeId: terminalNodes[0].id, edgeIds: lastOut ? [lastOut.id] : undefined }
        });
    } else {
        const returns = terminalNodes.map(n =>
            outgoingEdges[n.id][0] ? edgeLabel(outgoingEdges[n.id][0], `out_${n.id}`) : `out_${n.id}`
        );
        const edgeIds = terminalNodes.flatMap(n => outgoingEdges[n.id][0]?.id ? [outgoingEdges[n.id][0]!.id] : []);
        forwardLines.push({
            text: `        return (${returns.join(", ")})`,
            span: { kind: "return", edgeIds }
        });
    }

    // Stitch final lines with accurate line numbers for spans
    const stitch = (entries: { text: string; span?: Omit<CodeSpan, "line"> }[]) => {
        entries.forEach(entry => {
            lines.push(entry.text);
            if (entry.span) spans.push({ ...entry.span, line: lines.length });
        });
    };

    stitch(initLines);
    lines.push("");
    spans.push({ line: lines.length, kind: "header" });
    lines.push("    def forward(self, x):");
    spans.push({ line: lines.length, kind: "header" });
    stitch(forwardLines);

    return { code: lines.join("\n"), spans };
}
