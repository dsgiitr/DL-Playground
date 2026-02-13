/* eslint-disable react-refresh/only-export-components */
import { Handle, Position, type Edge, type Node } from "@xyflow/react";
import { type LayerDefinition } from "../node_gen/BaseClass";
import { getModule } from "../utils/moduleRegistry";
import { createLayerComponent } from "../node_gen/CreateNodeComponent";
import type { ModuleHandles } from "../utils/moduleRegistry";
import { verifyShapes } from "../utils/shape_verifier";

export type ModuleRefData = {
    moduleId?: string;
    name?: string;
    version?: string;
    handles?: ModuleHandles;
    description?: string;
    __highlight?: boolean;
    [key: string]: any; // Allow other properties for variables
};

type Handles = { targets: string[]; sources: string[] };

function toHandles(handles?: ModuleHandles): Handles {
    if (!handles) return { targets: ["in"], sources: ["out"] };
    const inputs = handles.inputs?.length ? handles.inputs : ["in"];
    const outputs = handles.outputs?.length ? handles.outputs : ["out"];
    return { targets: inputs, sources: outputs };
}
function runInternalVerification(data: ModuleRefData, inputShapes: number[][], registry: Record<string, any>) {
    // 1. Get Module
    if (!data.moduleId) return { ok: false as const, error: "No module ID" };
    const module = getModule(data.moduleId);
    if (!module) return { ok: false as const, error: "Module not found in registry" };

    const internalNodes = module.internalNodes || [];
    const internalEdges = module.internalEdges || [];

    const mockNodes: Node[] = [];
    const mockEdges: Edge[] = [];

    // Helper to find root nodes
    const internalNodeIds = new Set(internalNodes.map(n => n.id));
    const nodesWithIncoming = new Set<string>();
    internalEdges.forEach(e => {
        if (internalNodeIds.has(e.source) && internalNodeIds.has(e.target)) {
            nodesWithIncoming.add(e.target);
        }
    });

    const rootNodes = internalNodes.filter(n => !nodesWithIncoming.has(n.id));
    // Sort roots by Y then X to try and match "top-to-bottom" intuitive order
    rootNodes.sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));

    // Create mock inputs feeding these roots
    rootNodes.forEach((root, idx) => {
        if (idx >= inputShapes.length) return; // No input for this root?
        const shape = inputShapes[idx];

        if (root.type === 'input_layer') {
            const dims = shape.map((s, i) => ({ size: s, label: `d${i}` }));
            const newRoot = {
                ...root,
                data: { ...root.data, dims, _injectedShape: shape }
            };
            const rootIdx = internalNodes.findIndex(n => n.id === root.id);
            if (rootIdx !== -1) internalNodes[rootIdx] = newRoot;
        } else {
            const mockId = `__mock_in_${idx}`;
            mockNodes.push({
                id: mockId,
                type: 'input_layer', // Use valid type
                position: { x: root.position.x - 200, y: root.position.y },
                data: {
                    label: `Input ${idx}`,
                    dims: shape.map((s, i) => ({ size: s, label: `d${i}` }))
                }
            });
            mockEdges.push({
                id: `__mock_edge_${idx}`,
                source: mockId,
                target: root.id,
                sourceHandle: 'out',
                targetHandle: 'in' // Assumption
            });
        }
    });

    const verificationNodes = [...internalNodes, ...mockNodes];
    const verificationEdges = [...internalEdges, ...mockEdges];

    return verifyShapes(verificationNodes, verificationEdges, registry);
}

export const ModuleRefNode: LayerDefinition<ModuleRefData> = {
    label: "Module",
    diagramLabel: "Module",
    diagramFamily: "block",
    paramSchema: {},
    handles: (data: ModuleRefData) => toHandles(data.handles),

    shapeVerifier: (data: ModuleRefData, inputShapes: number[][], registry?: Record<string, any>) => {
        if (!registry) return { ok: true as const };
        const result = runInternalVerification(data, inputShapes, registry);
        if (!result.ok) {
            return {
                ok: false,
                error: "failed"
            };
        }
        return { ok: true };
    },

    shapeCompute: (data: ModuleRefData, inputShapes: number[][], context?: { registry: Record<string, any> }) => {
        const registry = context?.registry || (window as any).__LAYER_REGISTRY_GLOBAL__;

        if (!registry) return []; // Can't compute

        const result = runInternalVerification(data, inputShapes, registry);
        if (!result.ok) return [];

        // Find output nodes
        const module = getModule(data.moduleId!);
        if (!module) return [];

        const internalEdges = module.internalEdges || [];
        const nodesWithOutgoing = new Set<string>();
        internalEdges.forEach(e => {
            nodesWithOutgoing.add(e.source);
        });

        // Heuristic: leaf nodes are outputs
        const leafIds = module.internalNodes!.filter(n => !nodesWithOutgoing.has(n.id)).map(n => n.id);
        leafIds.sort(); // naive sort

        if (leafIds.length > 0) {
            const leafId = leafIds[0];
            return result.shapes[leafId]?.defaultShape || [];
        }

        return [];
    },

    getInitCode: (data: ModuleRefData, name: string) => `# module ${data.name || data.moduleId || name} (custom)`,
    getForwardCode: (_data: ModuleRefData, _name: string, inputs: Array<string>, outputs: Array<string>) => {
        const out = outputs[0] || "x";
        const input = inputs[0] || "x";
        return `${out} = ${input}  # module forward (simulated)`;
    },
    Component: createLayerComponent<ModuleRefData>(
        "Module",
        {},
        {
            // Dynamic Handles 
            handles: (data) => {
                const h = data.handles;
                return {
                    targets: h?.inputs?.length ? h.inputs : ["in"],
                    sources: h?.outputs?.length ? h.outputs : ["out"]
                };
            },
            // Variable Schema Resolution
            resolveSchema: (data) => {
                if (!data.moduleId) return {};
                const mod = getModule(data.moduleId)
                return mod?.variableSchema || {};
            },

            renderHeaderActions: (data, nodeId) => (
                <button
                    className="nodrag"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (data.moduleId) {
                            window.dispatchEvent(
                                new CustomEvent("module-open", {
                                    detail: { moduleId: data.moduleId, nodeId: nodeId }
                                })
                            )
                        }
                    }}
                    title="Edit Internal Graph"
                    style={{
                        cursor: "pointer",
                        border: "1px solid #78aecdff",
                        background: "#32353722",
                        color: "#4e9fcfff",
                        borderRadius: "2px",
                        fontSize: "12px",
                        padding: "5px 10px",
                        fontWeight: 600,
                        lineHeight: "12px",
                    }}
                >
                    Edit
                </button>
            )
        }
    ),
};
