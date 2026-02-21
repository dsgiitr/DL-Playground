import type { Node } from "@xyflow/react";

let id = 0;

export const getId = () => `node-${id++}`;

export const syncIdFromNodes = (nodes: Node[]) => {
    const maxId = nodes.reduce((max, n) => {
        const match = /^node-(\d+)$/.exec(n.id);
        if (!match) return max;
        const num = parseInt(match[1], 10);
        return Number.isFinite(num) ? Math.max(max, num) : max;
    }, -1);
    id = Math.max(id, maxId + 1);
};
