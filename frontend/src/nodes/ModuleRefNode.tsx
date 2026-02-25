/* eslint-disable react-refresh/only-export-components */
import { type Edge, type Node } from "@xyflow/react";
import { type LayerDefinition } from "../node_gen/BaseClass";
import { createLayerComponent } from "../node_gen/CreateNodeComponent";
import { sanitizeIdent } from "../utils/codeCompile";
import { getModule } from "../utils/moduleRegistry";
//import type { LayerData, LayerDefinition } from "../node_gen/BaseClass";  //LayerData was unused
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

    let internalNodes = module.internalNodes || [];
    const internalEdges = module.internalEdges || [];

    // 2. Apply Variable Mapping - Inject values from data into internal nodes
    if (module.variableMap) {
        const injectVariables = (nodes: Node[]): Node[] => {
            return nodes.map(node => {
                let updatedData = { ...node.data };
                
                if (Array.isArray(updatedData.internalNodes)) {
                    updatedData.internalNodes = injectVariables(updatedData.internalNodes);
                }
                // For each variable in the schema
                for (const varName in module.variableMap) {
                    const targets = module.variableMap[varName];

                    // Check if this node is a target for any variable
                    for (const target of targets) {
                        if (target.nodeId === node.id) {
                            // Inject the value from the ModuleRefNode's data
                            if (data[varName] !== undefined && data[varName] !== "" && data[varName] !== 0) {
                                updatedData[target.paramName] = data[varName];
                            }
                        }
                    }
                }

                return { ...node, data: updatedData };
            });
        }
        internalNodes = injectVariables(internalNodes);
    }

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

    const rootNodes = internalNodes.filter(n => {
        const isTopLevel = !n.parentId || !internalNodeIds.has(n.parentId);
        const hasNoIncoming = !nodesWithIncoming.has(n.id);
        return isTopLevel && hasNoIncoming;
    });
    // Sort roots by Y then X to try and match "top-to-bottom" intuitive order
    rootNodes.sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));

    // Create mock inputs feeding these roots
    rootNodes.forEach((root, idx) => {
        const shape = inputShapes[idx];

        if (root.type === 'input_layer') {
            // If external shape is provided, use it. Otherwise, use the input node's existing dims
            if (shape && shape.length > 0) {
                const dims = shape.map((s, i) => ({ size: s, label: `d${i}` }));
                const newRoot = {
                    ...root,
                    data: { ...root.data, dims, _injectedShape: shape }
                };
                const rootIdx = internalNodes.findIndex(n => n.id === root.id);
                if (rootIdx !== -1) internalNodes[rootIdx] = newRoot;
            }
            // If no shape provided, keep the input node's existing dims (already defined in module)
        } else {
            // Non-input root node - need external input
            if (!shape || idx >= inputShapes.length) return; // Skip if no input shape available
            const mockId = `__mock_in_${idx}`;
            let tHandle = 'in';
            const layerDef = registry && root.type ? registry[root.type] : null;
            if (layerDef && layerDef.handles) {
                const hDef = typeof layerDef.handles === "function"
                    ? layerDef.handles(root.data)
                    : layerDef.handles;
                if (hDef?.targets?.length) tHandle = hDef.targets[0];
            
            }
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
                targetHandle: tHandle // Assumption
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
        if (!registry) return { ok: true as const }; // Cannot verify without registry

        // Run full internal verification
        // Note: inputShapes might be empty if used standalone, but internal Input nodes may have their own dims
        const result = runInternalVerification(data, inputShapes, registry);
        if (!result.ok) {
            const firstFailure = "failures" in result ? result.failures?.[0] : result;
            const errorDetail = firstFailure ? `${firstFailure.error} (${"nodeId" in firstFailure ? firstFailure.nodeId : data.moduleId})` : "Internal verification failed";
            return {
                ok: false,
                error: errorDetail
            };
        }
        return { ok: true };
    },

    shapeCompute: (data: ModuleRefData, inputShapes: number[][], registry?: Record<string, any>) => {
        // const registry = context?.registry || (window as any).__LAYER_REGISTRY_GLOBAL__;

        if (!registry) {
            return []
        }; // Can't compute

        const result = runInternalVerification(data, inputShapes, registry);
        if (!result.ok) {
            return []
        };

        // Find output nodes
        const module = getModule(data.moduleId!);
        if (!module) {
            return []
        };

        const internalEdges = module.internalEdges || [];
        const internalNodes = module.internalNodes || [];
        const nodesWithOutgoing = new Set<string>();
        internalEdges.forEach(e => {
            nodesWithOutgoing.add(e.source);
        });

        // Heuristic: leaf nodes are outputs
        const leafIds = internalNodes.filter(n => !nodesWithOutgoing.has(n.id)).map(n => n.id);
        leafIds.sort(); // naive sort

        if (leafIds.length > 0) {
            const leafId = leafIds[0];
            return result.shapes[leafId]?.defaultShape || [];
        }
        return [];
    },

    getInitCode: (data: ModuleRefData, name: string) => {
        if (!data.moduleId) return `# module ${name} (no ID)`;
        const module = getModule(data.moduleId);
        if (!module) return `# module ${name} (not found)`;

        const moduleName = sanitizeIdent(module.name);
        const variableSchema = module.variableSchema || {};

        // Build parameter list for module instantiation
        const params: string[] = [];
        for (const varName in variableSchema) {
            const spec = variableSchema[varName];
            const value = data[varName];
            const type = (spec as any)?.type;

            if (value !== undefined) {
                // Use the literal value from node data
                if (type === 'string') {
                    params.push(`${varName}="${value}"`);
                } else if (type === 'boolean') {
                    params.push(`${varName}=${value ? "True" : "False"}`);
                } else {
                    params.push(`${varName}=${value}`);
                }
            } else {
                // Use variable reference (assuming outer module provides it)
                params.push(`${varName}=${varName}`);
            }
        }

        const paramStr = params.length > 0 ? params.join(', ') : '';
        return `self.${name} = ${moduleName}(${paramStr})`;
    },
    getForwardCode: (data: ModuleRefData, name: string, inputs: Array<string>, outputs: Array<string>) => {
        if (!data.moduleId) {
            const out = outputs[0] || "x";
            const input = inputs[0] || "x";
            return `${out} = ${input}  # module (no ID)`;
        }

        const module = getModule(data.moduleId);
        if (!module) {
            const out = outputs[0] || "x";
            const input = inputs[0] || "x";
            return `${out} = ${input}  # module (not found)`;
        }

        const callArgs = inputs.length > 0 ? inputs.join(', ') : '';
        const call = callArgs ? `(${callArgs})` : "()";

        if (outputs.length > 1) {
            return `${outputs.join(', ')} = self.${name}${call}`;
        }

        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}${call}`;
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
