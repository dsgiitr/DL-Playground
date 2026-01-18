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

// Sanitize arbitrary labels/ids into valid Python identifiers.
function sanitizeIdent(name: string): string {
    const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
    if (!cleaned.length) return "_x";
    const safe = /^[A-Za-z_]/.test(cleaned[0]) ? cleaned : `_${cleaned}`;
    return safe;
}
/**
 *  @deprecated Use functions in `codeCompile.ts`
 *  This function has been deprecated and a refactored version is added to codeCompile.ts
 *  Prefer generateMainCode and compileGraphtoScripts function
 */
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
        if (typeof lbl === "string" && lbl.trim().length > 0) return sanitizeIdent(lbl.trim());
        // fall back to a deterministic name based on the source node and handle
        const suffix = edge.sourceHandle ? edge.sourceHandle.replace(/[^a-zA-Z0-9_]/g, "_") : "out";
        return sanitizeIdent(`${fallback}_${suffix}`);
    };

    // Seed variables for all source-only (zero in-degree) nodes so downstream layers see defined tensors.
    const seedLines: { text: string; span?: Omit<CodeSpan, "line"> }[] = [];
    nodes
        .filter(n => (incomingEdges[n.id] ?? []).length === 0)
        .forEach(n => {
            const outs = outgoingEdges[n.id] ?? [];
            outs.forEach((e, idx) => {
                const name = edgeLabel(e, `in_${n.id}_${idx}`);
                seedLines.push({
                    text: `        ${name} = x  # input passthrough`,
                    span: { kind: "forward", nodeId: n.id, edgeIds: [e.id] },
                });
            });
        });

    sortedNodes.forEach((node, index) => {
        const layerName = `layer_${index}`;
        const type = node.type;

        if (type && LAYER_REGISTRY[type]) {
            const ClassRef = LAYER_REGISTRY[type];
            const line = ClassRef.getInitCode(node.data, layerName);

            initLines.push({ text: `        ${line}`, span: { kind: "init", nodeId: node.id } });

            const inEdges = incomingEdges[node.id];
            const inputNames =
                inEdges.length === 0 ? ["x"] : inEdges.map((e, idx) => edgeLabel(e, `in_${e.source || idx}`));

            const outEdges = outgoingEdges[node.id];
            const handlesSpec =
                typeof ClassRef.handles === "function" ? ClassRef.handles(node.data as any) : ClassRef.handles;
            const sourceHandles = handlesSpec?.sources && handlesSpec.sources.length ? handlesSpec.sources : [];
            const outputNames = (sourceHandles || []).length
                ? sourceHandles.map((handleId, idx) => {
                      const matching = outEdges.find(e => e.sourceHandle === handleId);
                      const base = matching
                          ? edgeLabel(matching, `out_${node.id}_${handleId}`)
                          : `out_${node.id}_${idx}`;
                      return sanitizeIdent(base);
                  })
                : outEdges.length === 0
                ? [sanitizeIdent(`out_${node.id}`)]
                : outEdges.map((e, idx) => edgeLabel(e, `out_${node.id}_${idx}`));

            const forward_line = ClassRef.getForwardCode(node.data, layerName, inputNames, outputNames);

            forwardLines.push({
                text: `        ${forward_line}`,
                span: { kind: "forward", nodeId: node.id, edgeIds: outEdges.map(e => e.id) },
            });
        }
    });

    const terminalNodes = sortedNodes.filter(n => outgoingEdges[n.id].length === 0);

    if (terminalNodes.length === 1) {
        const lastOut = outgoingEdges[terminalNodes[0].id][0];
        const lastOutName = lastOut
            ? edgeLabel(lastOut, `out_${terminalNodes[0].id}`)
            : sanitizeIdent(`out_${terminalNodes[0].id}`);
        forwardLines.push({
            text: `        return ${lastOutName}`,
            span: { kind: "return", nodeId: terminalNodes[0].id, edgeIds: lastOut ? [lastOut.id] : undefined },
        });
    } else {
        const returns = terminalNodes.map(n =>
            outgoingEdges[n.id][0] ? edgeLabel(outgoingEdges[n.id][0], `out_${n.id}`) : sanitizeIdent(`out_${n.id}`)
        );
        const edgeIds = terminalNodes.flatMap(n => (outgoingEdges[n.id][0]?.id ? [outgoingEdges[n.id][0]!.id] : []));
        forwardLines.push({
            text: `        return (${returns.join(", ")})`,
            span: { kind: "return", edgeIds },
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
    stitch(seedLines);
    stitch(forwardLines);

    return { code: lines.join("\n"), spans };
}
