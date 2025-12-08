import { renderHandles, type FieldSpec } from "./BaseClass";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { useMemo, useState } from "react";

const MODALITY_PRESETS: Record<string, { dims: DimSpec[] }> = {
    image: { dims: [{ label: "B", size: "1", type: "batch" }, { label: "C", size: "3", type: "channel" }, { label: "H", size: "224", type: "spatial" }, { label: "W", size: "224", type: "spatial" }] },
    text: { dims: [{ label: "B", size: "1", type: "batch" }, { label: "L", size: "128", type: "seq" }] },
    audio: { dims: [{ label: "B", size: "1", type: "batch" }, { label: "T", size: "16000", type: "time" }] },
    tabular: { dims: [{ label: "B", size: "1", type: "batch" }, { label: "F", size: "128", type: "feature" }] },
    video: { dims: [{ label: "B", size: "1", type: "batch" }, { label: "T", size: "8", type: "time" }, { label: "C", size: "3", type: "channel" }, { label: "H", size: "224", type: "spatial" }, { label: "W", size: "224", type: "spatial" }] }
};

type DimSpec = { label: string; size?: string; type?: string };
type InputData = {
    modality?: string;
    dims?: DimSpec[];
};

const parseSize = (val?: string) => {
    if (val === undefined || val === null || val === "") return NaN;
    const n = Number(val);
    return Number.isFinite(n) ? n : NaN;
};

export class InputNode {
    static label = "Input";
    static paramSchema: Record<string, FieldSpec> = {};
    static handles = { targets: [], sources: ["out-0"] };

    static shapeVerifier(data: InputData) {
        const dims = data.dims || [];
        if (!dims.length) return { ok: false as const, error: "Define at least one dimension" };
        for (const dim of dims) {
            const n = parseSize(dim.size);
            if (!Number.isFinite(n) || n <= 0) {
                return { ok: false as const, error: `Dimension ${dim.label || "?"} must be a positive number` };
            }
        }
        return { ok: true as const };
    }

    static shapeCompute(data: InputData) {
        const dims = data.dims || [];
        return dims.map(d => parseSize(d.size));
    }

    static getInitCode() {
        return "# input layer does not require initialization";
    }

    static getForwardCode(_data: InputData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = ${inputVar}  # input passthrough`;
    }

    static Component = function InputComponent({ id, data, isConnectable }: NodeProps) {
        const { setNodes } = useReactFlow();
        const safeData: InputData = data || {};
        const [isExpanded, setIsExpanded] = useState(true);

        const applyPreset = (modality: string) => {
            const preset = MODALITY_PRESETS[modality];
            setNodes(nodes =>
                nodes.map(n => (n.id === id ? { ...n, data: { ...n.data, modality, dims: preset?.dims || [] } } : n))
            );
        };

        const updateDims = (dims: DimSpec[]) => {
            setNodes(nodes =>
                nodes.map(n => (n.id === id ? { ...n, data: { ...n.data, dims } } : n))
            );
        };

        const onDimChange = (index: number, key: keyof DimSpec, value: string) => {
            const dims = [...(safeData.dims || [])];
            dims[index] = { ...dims[index], [key]: value };
            updateDims(dims);
        };

        const onAddDim = () => {
            const dims = [...(safeData.dims || [])];
            dims.push({ label: `D${dims.length}`, size: "1", type: "other" });
            updateDims(dims);
        };

        const onRemoveDim = (index: number) => {
            const dims = [...(safeData.dims || [])];
            dims.splice(index, 1);
            updateDims(dims);
        };

        const shapePreview = useMemo(() => {
            const live = (safeData as any).__shape as number[] | undefined;
            if (Array.isArray(live) && live.length > 0) return JSON.stringify(live);
            if (safeData.dims && safeData.dims.length) return safeData.dims.map(d => d.size || "?").join("×");
            return "define dims";
        }, [safeData]);

        return (
            <div
                className="layer-node"
                style={{
                    backgroundColor: "#222",
                    border: isExpanded ? "1px solid #64ffda" : "1px solid #555",
                    borderRadius: "8px",
                    minWidth: "200px",
                    transition: "all 0.2s",
                    position: "relative"
                }}
            >
                {/* Input nodes have no targets */}
                <div
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        fontWeight: "bold",
                        color: "#64ffda",
                        borderBottom: "1px solid #444",
                        padding: "8px",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                    }}
                >
                    <span>{InputNode.label}</span>
                </div>

                {isExpanded && (
                    <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <label style={{ fontSize: 11, color: "#aaa", minWidth: 60 }}>Modality</label>
                            <select
                                className="nodrag"
                                value={safeData.modality || "none"}
                                onChange={e => applyPreset(e.target.value)}
                                style={{ background: "#111", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "4px", minWidth: 120 }}
                            >
                                <option value="none">None</option>
                                <option value="image">Image</option>
                                <option value="text">Text</option>
                                <option value="audio">Audio</option>
                                <option value="tabular">Tabular</option>
                                <option value="video">Video</option>
                                <option value="other">Other</option>
                            </select>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "#aaa" }}>Dimensions</span>
                            <button
                                className="nodrag"
                                onClick={onAddDim}
                                style={{ padding: "4px 6px", background: "#444", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
                            >
                                + Dim
                            </button>
                        </div>
                        {(safeData.dims || []).map((dim, idx) => (
                            <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <input
                                    className="nodrag"
                                    style={{ width: 50, background: "#111", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "2px 4px" }}
                                    value={dim.label || ""}
                                    onChange={e => onDimChange(idx, "label", e.target.value)}
                                    placeholder="Label"
                                />
                                <input
                                    className="nodrag"
                                    style={{ width: 70, background: "#111", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "2px 4px" }}
                                    value={dim.size || ""}
                                    onChange={e => onDimChange(idx, "size", e.target.value)}
                                    placeholder="Size"
                                />
                                <select
                                    className="nodrag"
                                    style={{ background: "#111", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "2px 4px" }}
                                    value={dim.type || "other"}
                                    onChange={e => onDimChange(idx, "type", e.target.value)}
                                >
                                    <option value="batch">batch</option>
                                    <option value="channel">channel</option>
                                    <option value="spatial">spatial</option>
                                    <option value="seq">seq</option>
                                    <option value="feature">feature</option>
                                    <option value="time">time</option>
                                    <option value="other">other</option>
                                </select>
                                <button
                                    className="nodrag"
                                    onClick={() => onRemoveDim(idx)}
                                    style={{ background: "#d9534f", color: "#fff", border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ padding: "0 10px 10px", fontSize: "10px", color: "#888" }}>
                    Shape: {shapePreview}
                </div>
                {renderHandles("right", InputNode.handles.sources, isConnectable)}
            </div>
        );
    };
}
