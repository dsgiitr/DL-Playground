import type { NodeTypes } from "@xyflow/react";
import { LAYER_REGISTRY, NODE_GROUPS } from "../nodes/registry";

export { LAYER_REGISTRY, NODE_GROUPS };

// Bridge the layer registry into React Flow's node component map.
export const nodeTypes: NodeTypes = Object.entries(LAYER_REGISTRY).reduce((acc, [key, Class]) => {
    acc[key] = Class.Component;
    return acc;
}, {} as any);
