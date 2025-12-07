import type { Edge, Node } from "@xyflow/react";
import { LAYER_REGISTRY } from "../types/nodeTypes";


// Current code doesn't work for multiple inputs. We need to add input blocks or something similar. Output blocks can also be created.
// Right now if the same output is being used by 2 blocks hence 2 protruding edges are there then the label on each edge is different, this may be changed later.
// Though this requires us that the nodes have labelled outputs and edges are not between 2 nodes but between 2 "handles"
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
    let initBlock = "";
    let forwardBlock = "    def forward(self, x):\n"; // This needs to be changed when multiple inputs are dealt with

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

            const inEdges = incomingEdges[node.id];
            const inputNames =
                inEdges.length === 0
                    ? ["x"]
                    : inEdges.map(e => e.label as string);

            
            const outEdges = outgoingEdges[node.id];
            const outputNames =
                outEdges.length === 0
                    ? [`out_${node.id}`]   // Abhi ke liye
                    : outEdges.map(e => e.label as string);

            const forward_line = ClassRef.getForwardCode(
                layerName,
                inputNames,
                outputNames,
                node.data
            );

            forwardBlock += `        ${forward_line}\n`;
        }
    });

    const terminalNodes = sortedNodes.filter(
        n => outgoingEdges[n.id].length === 0
    );

    if (terminalNodes.length === 1) {
        const lastOut = outgoingEdges[terminalNodes[0].id][0]?.label;
        forwardBlock += `        return ${lastOut ?? "out_" + terminalNodes[0].id}\n`;
    } else {
        const returns = terminalNodes.map(n =>
            outgoingEdges[n.id][0]?.label ?? `out_${n.id}`
        );
        forwardBlock += `        return (${returns.join(", ")})\n`;
    }

    return `import torch
import torch.nn as nn

class GeneratedModel(nn.Module):
    def __init__(self):
        super().__init__()
${initBlock}

${forwardBlock}`;
}
