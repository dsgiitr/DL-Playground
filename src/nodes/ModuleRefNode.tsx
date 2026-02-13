/* eslint-disable react-refresh/only-export-components */
import { Handle, Position, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { useMemo, useState, type ComponentType } from "react";
import { ParamsList, type FieldType, type LayerDefinition } from "../node_gen/BaseClass";
import { getModule } from "../utils/moduleRegistry";
//import type { LayerData, LayerDefinition } from "../node_gen/BaseClass";  //LayerData was unused
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
type ModuleRefNodeType = Node<ModuleRefData, "module_ref">;

function renderHandles(side: "left" | "right", ids: string[]) {
    return ids.map((idLabel, i, arr) => {
        const topPct = `${((i + 1) / (arr.length + 1)) * 100}%`;
        const isLeft = side === "left";
        return (
            <div
                key={`${side}-${idLabel}`}
                style={{
                    position: "absolute",
                    [isLeft ? "left" : "right"]: -22,
                    top: topPct,
                    transform: "translateY(-50%)",
                    display: "flex",
                    alignItems: "center",
                    pointerEvents: "auto"
                }}
            >
                <Handle
                    id={idLabel}
                    type={isLeft ? "target" : "source"}
                    position={isLeft ? Position.Left : Position.Right}
                    isConnectable
                    style={{
                        background: "#888",
                        border: "1px solid #222"
                    }}
                />
            </div>
        );
    });
}

function toHandles(handles?: ModuleHandles): Handles {
    if (!handles) return { targets: ["in"], sources: ["out"] };
    const inputs = handles.inputs?.length ? handles.inputs : ["in"];
    const outputs = handles.outputs?.length ? handles.outputs : ["out"];
    return { targets: inputs, sources: outputs };
}
const ModuleRefComponent: ComponentType<NodeProps<ModuleRefNodeType>> = ({ id, data, isConnectable }) => {
    const { setNodes, setEdges } = useReactFlow();
    const [isExpanded, setIsExpanded] = useState(false);
    const handles = toHandles(data?.handles);
    const name = data?.name || "Module";
    const version = data?.version || "v1";
    const isHighlighted = !!data?.__highlight;

    const module = useMemo(() => (data?.moduleId ? getModule(data.moduleId) : undefined), [data?.moduleId]);
    const paramSchema = useMemo(() => module?.variableSchema || {}, [module]);

    const { requiredParams, optionalParams } = useMemo(() => {
        const keys = Object.keys(paramSchema);
        const req = keys.filter(k => paramSchema[k].required);
        const opt = keys.filter(k => !paramSchema[k].required);
        return { requiredParams: req, optionalParams: opt };
    }, [paramSchema]);

    const onChange = (key: string, type: FieldType) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        let newValue: any = e.target.value;
        if (type === "number") {
            newValue = newValue === "" ? undefined : parseFloat(newValue);
        } else if (type === "boolean") {
            newValue = (e.target as HTMLInputElement).checked;
        }
        setNodes(nodes =>
            nodes.map(n => {
                if (n.id !== id) return n;
                const newData: ModuleRefData = { ...n.data };
                if (newValue === undefined || newValue === "") {
                    delete newData[key];
                } else {
                    newData[key] = newValue;
                }
                return { ...n, data: newData };
            })
        );
    };

    const paramsToShow = new Set(requiredParams);
    optionalParams.forEach(key => {
        if (isExpanded || data[key] !== undefined) {
            paramsToShow.add(key);
        }
    });
    const renderList = [...requiredParams, ...optionalParams.filter(k => paramsToShow.has(k))];
    const hiddenOptionCount = optionalParams.length - (renderList.length - requiredParams.length);

    return (
        <div
            style={{
                background: isHighlighted ? "#1f2a2f" : "#1a1a1a",
                border: isHighlighted ? "1px solid #64ffda" : "1px solid #444",
                borderRadius: 10,
                minWidth: 220,
                padding: "10px 12px",
                position: "relative",
                boxShadow: isHighlighted ? "0 0 0 2px #64ffda55" : undefined,
                color: "#e6edf3",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
                    <div style={{ fontSize: 11, color: "#9fb0c3" }}>{version}</div>
                </div>
                {data?.description && (
                    <span style={{ fontSize: 11, color: "#aaa", maxWidth: 120, textAlign: "right" }}>
                        {data.description}
                    </span>
                )}
            </div>

            {renderList.length > 0 && <div style={{ borderBottom: '1px solid #333', margin: '6px 0' }} />}

            <ParamsList
                renderKeys={renderList}
                optionalParams={optionalParams}
                paramSchema={paramSchema}
                data={data}
                onChange={onChange}
                onExpand={() => setIsExpanded(true)}
                hiddenCount={!isExpanded ? hiddenOptionCount : 0}
            />

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11, color: "#9fb0c3", alignItems: "center" }}>
                <span>{handles.targets.length} in</span>
                <span>•</span>
                <span>{handles.sources.length} out</span>
                <button
                    className="nodrag"
                    onClick={e => {
                        e.stopPropagation();
                        if (data?.moduleId) {
                            window.dispatchEvent(
                                new CustomEvent("module-open", {
                                    detail: { moduleId: data.moduleId, nodeId: id, data },
                                })
                            );
                        }
                    }}
                    title="Open module"
                    style={{
                        marginLeft: "auto",
                        padding: "2px 6px",
                        background: "#1f8ecd",
                        border: "1px solid #1f8ecd",
                        color: "#fff",
                        borderRadius: 6,
                        cursor: data?.moduleId ? "pointer" : "not-allowed",
                        fontSize: 10,
                    }}
                    disabled={!data?.moduleId}
                >
                    Open
                </button>
                <button
                    className="nodrag"
                    onClick={e => {
                        e.stopPropagation();
                        setNodes(nodes => nodes.filter(n => n.id !== id));
                        setEdges(eds => eds.filter(edge => edge.source !== id && edge.target !== id));
                    }}
                    title="Delete module"
                    style={{
                        padding: "2px 6px",
                        background: "#2b2b2b",
                        border: "1px solid #444",
                        color: "#ccc",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 10,
                    }}
                >
                    Delete
                </button>
            </div>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
                <div style={{ position: "absolute", inset: 0 }}>
                    {isConnectable && (
                        <div style={{ pointerEvents: "all" }}>{renderHandles("left", handles.targets)}</div>
                    )}
                    {isConnectable && (
                        <div style={{ pointerEvents: "all" }}>{renderHandles("right", handles.sources)}</div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Shape Verification Helpers ---

// Helper to run verification on the internal graph
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
        if (!registry) return { ok: true as const }; // Cannot verify without registry
        // Run full internal verification
        const result = runInternalVerification(data, inputShapes, registry);

        // Return type must be { ok: true } | { ok: false, error: string }
        if (!result.ok) {
            return {
                ok: false,
                error: "failed"
            };
        }
        return { ok: true };
    },

    shapeCompute: (data: ModuleRefData, inputShapes: number[][], context?: { registry: Record<string, any> }) => {
        const registry = context?.registry || (window as any).__LAYER_REGISTRY_GLOBAL__; // Fallback if possible?

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
