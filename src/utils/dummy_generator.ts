import type { Edge, Node } from "@xyflow/react";
import { LAYER_REGISTRY } from "../types/nodeTypes";

export function generatePyTorchCode(nodes: Node[], edges: Edge[]) {
    if (nodes.length === 0) return "class Model(nn.Module):\n    pass";

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

    // 3. Generate Code
    let initBlock = "";
    let forwardBlock = "    def forward(self, x):\n";

    sortedNodes.forEach((node, index) => {
        const layerName = `layer_${index}`;
        const type = node.type;

        if (type && LAYER_REGISTRY[type]) {
            const ClassRef = LAYER_REGISTRY[type];
            const line = ClassRef.getInitCode(node.data, layerName);

            // similar stuff will be done for forward block as well
            // you will need to write the code that creates the nodes and edges list
            // function call can look like this
            // foward_line = ClassRef.getForwardCode(node.data, layerName, input_name_list, output_name_list)
            initBlock += `        ${line}\n`;
            forwardBlock += `        x = self.${layerName}(x)\n`;
        }
    });

    forwardBlock += `        return x`;

    return `import torch
import torch.nn as nn

class GeneratedModel(nn.Module):
    def __init__(self):
        super().__init__()
${initBlock}

${forwardBlock}`;
}
