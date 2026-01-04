/* eslint-disable react-refresh/only-export-components */
import type { ComponentType } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import type { LayerData, LayerDefinition } from "../node_gen/BaseClass";
import type { ModuleHandles } from "../utils/moduleRegistry";

export type ModuleRefData = {
    moduleId?: string;
    name?: string;
    version?: string;
    handles?: ModuleHandles;
    description?: string;
    __highlight?: boolean;
};

type Handles = { targets: string[]; sources: string[] };

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

const ModuleRefComponent: ComponentType<NodeProps<ModuleRefData>> = ({ id, data, isConnectable }) => {
    const { setNodes, setEdges } = useReactFlow();
    const handles = toHandles(data?.handles ?? (data as { contract?: ModuleHandles } | undefined)?.contract);
    const name = data?.name || "Module";
    const version = data?.version || "v1";
    const isHighlighted = !!data?.__highlight;

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
                                    detail: { moduleId: data.moduleId, nodeId: id },
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
                        marginLeft: "auto",
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

export const ModuleRefNode: LayerDefinition<ModuleRefData> = {
    label: "Module",
    diagramLabel: "Module",
    diagramFamily: "block",
    paramSchema: {},
    handles: (data: ModuleRefData) => toHandles(data.handles ?? (data as { contract?: ModuleHandles }).contract),
    shapeVerifier: (data: ModuleRefData, inputShapes: number[][]) => {
        void data;
        void inputShapes;
        return { ok: true as const };
    },
    shapeCompute: (_data: ModuleRefData, inputShapes: number[][]) => inputShapes?.[0] || [],
    getInitCode: (data: ModuleRefData, name: string) => `# module ${data.name || data.moduleId || name}`,
    getForwardCode: (_data: ModuleRefData, _name: string, inputs: Array<string>, outputs: Array<string>) => {
        const out = outputs[0] || "x";
        const input = inputs[0] || "x";
        return `${out} = ${input}  # module passthrough placeholder`;
    },
    Component: ModuleRefComponent,
};
