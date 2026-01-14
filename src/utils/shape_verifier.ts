import type { Edge, Node } from "@xyflow/react";
import { LAYER_REGISTRY } from "../types/nodeTypes";

export type ShapeFailure = {
  nodeId: string;
  nodeType?: string;
  label?: string;
  error: string;
  inputShapes?: number[][];
  upstream?: string[];
};
type NodeShapes = {
  defaultShape: number[];
  byHandle?: Record<string, number[]>;
};

export type ShapeResult = {
  ok: boolean;
  shapes: Record<string, NodeShapes>;
  failures: ShapeFailure[];
};

export function verifyShapes(nodes: Node[], edges: Edge[], registry?: Record<string, any>): ShapeResult {
  const reg = registry || LAYER_REGISTRY;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const sources: Record<string, string[]> = {};
  const edgesByTarget: Record<string, Edge[]> = {};

  edges.forEach((e) => {
    const sourceNode = byId[e.source];
    const targetNode = byId[e.target];
    // Skip edges where target is inside source (parent-child relationship)
    if (sourceNode && targetNode) {
      if (sourceNode.parentId === targetNode.id) {
        return;
      }
    }
    if (byId[e.target]) {
      (sources[e.target] ||= []).push(e.source);
      (edgesByTarget[e.target] ||= []).push(e);
    }
  });

  const shapes: Record<string, NodeShapes> = {};
  const failures: ShapeFailure[] = [];
  const pending = new Set(nodes.map((n) => n.id));

  let progressed = true;
  while (pending.size && progressed) {
    progressed = false;
    for (const id of Array.from(pending)) {
      const node = byId[id];
      if (!node) {
        pending.delete(id);
        continue;
      }
      const layer = node.type ? reg[node.type] : undefined;
      if (!layer) {
        failures.push({
          nodeId: id,
          nodeType: node.type,
          error: `Unknown node type: ${node.type ?? "undefined"}`,
        });
        pending.delete(id);
        progressed = true;
        continue;
      }
      const inputIds = sources[id] || [];
      if (inputIds.some((src) => !byId[src])) {
        failures.push({
          nodeId: id,
          nodeType: node.type,
          label: layer.label,
          error: "Missing upstream node",
          upstream: inputIds,
        });
        pending.delete(id);
        progressed = true;
        continue;
      }
      const ready = inputIds.every((src) => shapes[src]);
      if (!ready) continue;

      // Gather input shapes, respecting sourceHandle for multi-output nodes
      const inputShapes = inputIds.map((srcId, idx) => {
        const srcShape = shapes[srcId];
        if (!srcShape) return [];

        // Find the edge connecting srcId -> current node
        const connectingEdges =
          edgesByTarget[id]?.filter((e) => e.source === srcId) || [];
        const sourceHandle = connectingEdges[idx]?.sourceHandle;

        // If source has per-handle shapes and we know which handle, use it
        if (
          sourceHandle &&
          srcShape.byHandle &&
          srcShape.byHandle[sourceHandle]
        ) {
          return srcShape.byHandle[sourceHandle];
        }

        // Otherwise use default shape
        return srcShape.defaultShape || [];
      });
      const verdict = layer.shapeVerifier(node.data as any, inputShapes);
      if (!verdict.ok) {
        failures.push({
          nodeId: id,
          nodeType: node.type,
          label: layer.label,
          error: verdict.error,
          inputShapes,
          upstream: inputIds,
        });
        pending.delete(id);
        progressed = true;
        continue;
      }
      const computed = layer.shapeCompute(node.data as any, inputShapes) as any;
      if (Array.isArray(computed)) {
        shapes[id] = { defaultShape: computed };
      } else if (computed && typeof computed === "object") {
        const entries = Object.entries(computed as Record<string, number[]>);
        const first = entries[0]?.[1] || [];
        shapes[id] = { defaultShape: first, byHandle: computed };
      } else {
        shapes[id] = { defaultShape: [] };
      }
      pending.delete(id);
      progressed = true;
    }
  }

  if (pending.size) {
    pending.forEach((id) => {
      const node = byId[id];
      const layer = node?.type ? reg[node.type] : undefined;
      failures.push({
        nodeId: id,
        nodeType: node?.type,
        label: layer?.label,
        error: "Missing upstream shape (disconnected edge or invalid source)",
        upstream: sources[id] || [],
      });
    });
  }

  return { ok: failures.length === 0, shapes, failures };
}
