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

// Current code doesn't work for multiple inputs. We need to add input blocks or something similar. Output blocks can also be created.
// Right now if the same output is being used by 2 blocks hence 2 protruding edges are there then the label on each edge is different, this may be changed later.
// Though this requires us that the nodes have labelled outputs and edges are not between 2 nodes but between 2 "handles"
export function generatePyTorchCode(
  nodes: Node[],
  edges: Edge[]
): CodeGenResult {
  if (nodes.length === 0)
    return { code: "class Model(nn.Module):\n    pass", spans: [] };

  const lines: string[] = [];
  const spans: CodeSpan[] = [];
  const initLines: { text: string; span?: Omit<CodeSpan, "line"> }[] = [];
  const forwardLines: { text: string; span?: Omit<CodeSpan, "line"> }[] = [];

  // 1. Build Adjacency List
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  nodes.forEach((n) => {
    adj[n.id] = [];
    inDegree[n.id] = 0;
  });
  edges.forEach((e) => {
    if (adj[e.source]) adj[e.source].push(e.target);
    if (inDegree[e.target] !== undefined) inDegree[e.target]++;
  });

  // 2. Topological Sort
  const queue: string[] = nodes
    .filter((n) => inDegree[n.id] === 0)
    .map((n) => n.id);
  const sortedIds: string[] = [];

  while (queue.length > 0) {
    const u = queue.shift()!;
    sortedIds.push(u);
    if (adj[u]) {
      adj[u].forEach((v) => {
        inDegree[v]--;
        if (inDegree[v] === 0) queue.push(v);
      });
    }
  }

  const finalOrderIds =
    sortedIds.length === nodes.length ? sortedIds : nodes.map((n) => n.id);
  const sortedNodes = finalOrderIds.map(
    (id) => nodes.find((n) => n.id === id)!
  );

  // This code creates a list of all the input and output edges of a node
  const incomingEdges: Record<string, Edge[]> = {};
  const outgoingEdges: Record<string, Edge[]> = {};

  nodes.forEach((n) => {
    incomingEdges[n.id] = [];
    outgoingEdges[n.id] = [];
  });

  edges.forEach((e) => {
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

  // Track output variable names for each node's handles
  const outputVars: Record<string, Record<string, string>> = {}; // nodeId -> handleId -> varName
  const varCounter: Record<string, number> = {}; // Track variable name usage for uniqueness

  // Helper: get or create output variable name for a node's handle
  const getOutputVar = (
    nodeId: string,
    handleId: string,
    node: Node | undefined
  ): string => {
    if (!outputVars[nodeId]) outputVars[nodeId] = {};
    if (outputVars[nodeId][handleId]) return outputVars[nodeId][handleId];

    // Generate variable name from handle label
    const handleLabels =
      (node?.data?.__handleLabels as Record<string, string> | undefined) || {};
    const customLabel = handleLabels[handleId];

    if (customLabel && customLabel.trim()) {
      let varName = sanitizeIdent(customLabel.trim());
      // Ensure uniqueness
      let finalName = varName;
      let counter = 1;
      while (
        Object.values(outputVars).some((handles) =>
          Object.values(handles).includes(finalName)
        )
      ) {
        finalName = `${varName}_${counter}`;
        counter++;
      }
      outputVars[nodeId][handleId] = finalName;
      return finalName;
    }

    // Fallback: use 'x' as base name for generic outputs
    // Strip common patterns like 'out', 'out-0', 'out_0' to just use 'x'
    const baseName = "x";

    // Make it unique by appending counter
    if (!varCounter[baseName]) varCounter[baseName] = 0;
    const varName =
      varCounter[baseName] === 0
        ? baseName
        : `${baseName}_${varCounter[baseName]}`;
    varCounter[baseName]++;

    outputVars[nodeId][handleId] = varName;
    return varName;
  };

  // Seed variables for input nodes (no incoming edges)
  const seedLines: { text: string; span?: Omit<CodeSpan, "line"> }[] = [];
  const inputNodeIds = new Set<string>();

  nodes
    .filter((n) => (incomingEdges[n.id] ?? []).length === 0)
    .forEach((n) => {
      inputNodeIds.add(n.id);
      const outs = outgoingEdges[n.id] ?? [];
      if (outs.length === 0) {
        // No outputs, still assign a variable
        const varName = getOutputVar(n.id, "out", n);
        seedLines.push({
          text: `        ${varName} = x  # input passthrough`,
          span: { kind: "forward", nodeId: n.id },
        });
      } else {
        // For each output handle, create a variable
        const handles = new Set(outs.map((e) => e.sourceHandle || "out"));
        handles.forEach((handleId) => {
          const varName = getOutputVar(n.id, handleId, n);
          seedLines.push({
            text: `        ${varName} = x  # input passthrough`,
            span: {
              kind: "forward",
              nodeId: n.id,
              edgeIds: outs
                .filter((e) => (e.sourceHandle || "out") === handleId)
                .map((e) => e.id),
            },
          });
        });
      }
    });

  sortedNodes.forEach((node, index) => {
    const layerName = `layer_${index}`;
    const type = node.type;

    if (type && LAYER_REGISTRY[type]) {
      const ClassRef = LAYER_REGISTRY[type];
      const line = ClassRef.getInitCode(node.data, layerName);

      initLines.push({
        text: `        ${line}`,
        span: { kind: "init", nodeId: node.id },
      });

      // Skip forward pass for input nodes - already handled in seed section
      if (inputNodeIds.has(node.id)) {
        return;
      }

      // Get input variable names from incoming edges
      const inEdges = incomingEdges[node.id];
      const inputNames =
        inEdges.length === 0
          ? ["x"]
          : inEdges.map((e) => {
              const srcNode = nodes.find((n) => n.id === e.source);
              const srcHandle = e.sourceHandle || "out";
              return getOutputVar(e.source, srcHandle, srcNode);
            });

      const outEdges = outgoingEdges[node.id];

      // Determine output variable names
      const handleSchema =
        typeof ClassRef.handleSchema === "function"
          ? ClassRef.handleSchema(node.data as any)
          : ClassRef.handleSchema;

      let outputNames: string[];

      if (handleSchema) {
        // Use HandleSchema: sort outputs by position
        const sortedOutputs = handleSchema.outputs.sort(
          (a, b) => a.position - b.position
        );
        outputNames = sortedOutputs.map((handle) =>
          getOutputVar(node.id, handle.id, node)
        );
      } else {
        // Legacy: use handles.sources or default
        const handlesSpec =
          typeof ClassRef.handles === "function"
            ? ClassRef.handles(node.data as any)
            : ClassRef.handles;
        const sourceHandles = handlesSpec?.sources || [];

        if (sourceHandles.length > 0) {
          outputNames = sourceHandles.map((handleId) =>
            getOutputVar(node.id, handleId, node)
          );
        } else if (outEdges.length > 0) {
          // Use actual output handles from edges
          const handles = Array.from(
            new Set(outEdges.map((e) => e.sourceHandle || "out"))
          );
          outputNames = handles.map((handleId) =>
            getOutputVar(node.id, handleId, node)
          );
        } else {
          // No outputs defined, use default
          outputNames = [getOutputVar(node.id, "out", node)];
        }
      }

      const forward_line = ClassRef.getForwardCode(
        node.data,
        layerName,
        inputNames,
        outputNames
      );

      forwardLines.push({
        text: `        ${forward_line}`,
        span: {
          kind: "forward",
          nodeId: node.id,
          edgeIds: outEdges.map((e) => e.id),
        },
      });
    }
  });

  const terminalNodes = sortedNodes.filter(
    (n) => outgoingEdges[n.id].length === 0
  );

  if (terminalNodes.length === 1) {
    const node = terminalNodes[0];
    const outputHandles = Object.keys(outputVars[node.id] || {});
    const varName =
      outputHandles.length > 0
        ? outputVars[node.id][outputHandles[0]]
        : getOutputVar(node.id, "out", node);

    forwardLines.push({
      text: `        return ${varName}`,
      span: { kind: "return", nodeId: node.id },
    });
  } else if (terminalNodes.length > 1) {
    const returns = terminalNodes.map((n) => {
      const handles = Object.keys(outputVars[n.id] || {});
      return handles.length > 0
        ? outputVars[n.id][handles[0]]
        : getOutputVar(n.id, "out", n);
    });
    forwardLines.push({
      text: `        return (${returns.join(", ")})`,
      span: { kind: "return" },
    });
  } else {
    // No terminal nodes (all have outputs) - return last computed variable
    if (sortedNodes.length > 0) {
      const lastNode = sortedNodes[sortedNodes.length - 1];
      const handles = Object.keys(outputVars[lastNode.id] || {});
      const varName =
        handles.length > 0
          ? outputVars[lastNode.id][handles[0]]
          : getOutputVar(lastNode.id, "out", lastNode);
      forwardLines.push({
        text: `        return ${varName}`,
        span: { kind: "return", nodeId: lastNode.id },
      });
    }
  }

  // Stitch final lines with accurate line numbers for spans
  const stitch = (
    entries: { text: string; span?: Omit<CodeSpan, "line"> }[]
  ) => {
    entries.forEach((entry) => {
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
