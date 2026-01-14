import type { NodeTypes } from "@xyflow/react";
import { LAYER_REGISTRY, NODE_GROUPS } from "../nodes/registry";

export { LAYER_REGISTRY, NODE_GROUPS };

// Bridge the layer registry into React Flow's node component map.
export const nodeTypes: NodeTypes = Object.entries(LAYER_REGISTRY).reduce((acc, [key, Class]) => {
    if (!Class) {
        console.error(`Layer ${key} is undefined in registry. Check circular dependencies.`);
        return acc;
    }
    if (!Class.Component) {
        console.error(`Layer ${key} has no Component. Check definition.`);
        return acc;
    }
    acc[key] = Class.Component;
    return acc;
}, {} as any);
