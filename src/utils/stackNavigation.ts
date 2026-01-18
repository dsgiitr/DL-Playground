import type { Edge, Node } from "@xyflow/react";
import type { SavedModule } from "./moduleRegistry";

export type OpenModule = {
    module: SavedModule;
    nodes: Node[];
    edges: Edge[];
    fromNodeId?: string;
};

export const getActiveModule = (stack: OpenModule[]) =>
    stack.length ? stack[stack.length - 1] : null;

export const pushModule = (stack: OpenModule[], entry: OpenModule) => [...stack, entry];

export const popModule = (stack: OpenModule[]) => stack.slice(0, -1);

export const updateActiveModule = (stack: OpenModule[], updater: (current: OpenModule) => OpenModule) => {
    if (!stack.length) return stack;
    const top = stack[stack.length - 1];
    const updated = updater(top);
    return [...stack.slice(0, -1), updated];
};
