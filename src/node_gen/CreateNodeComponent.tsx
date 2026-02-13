import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { useMemo, useState } from "react";
import { ParamsList, renderHandles, type FieldSpec, type FieldType, type HandleFactory, type HandleSpec, type LayerData } from "./BaseClass";

export function createLayerComponent<D extends LayerData>(
    label: string,
    paramSchema: Record<string, FieldSpec>,
    options?: { targetHandles?: number; handles?: HandleSpec | HandleFactory<D> }
) {
    return ({ id, data, isConnectable }: NodeProps<Node<any>>) => {
        const { setNodes, setEdges } = useReactFlow();
        const [isExpanded, setIsExpanded] = useState(false);
        const safeData = data || ({} as D);
        const isHighlighted = !!(safeData as any).__highlight;

        const { requiredParams, optionalParams } = useMemo(() => {
            const keys = Object.keys(paramSchema);
            const req = keys.filter(k => paramSchema[k].required);
            const opt = keys.filter(k => !paramSchema[k].required);
            return { requiredParams: req, optionalParams: opt };
        }, []);

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
                    const newData = { ...n.data };
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
            const currentVal = safeData[key];
            const defaultVal = paramSchema[key].defaultValue;
            const isDefault = currentVal === defaultVal;
            if (isExpanded || !isDefault) {
                paramsToShow.add(key)
            }
        });
        const renderList = [...requiredParams, ...optionalParams.filter(k => paramsToShow.has(k))];
        const hiddenOptionCount = optionalParams.length - (renderList.length - requiredParams.length);

        const shapePreview = (() => {
            const liveShape = (safeData as any).__shape as number[] | undefined;
            if (Array.isArray(liveShape) && liveShape.length > 0) return JSON.stringify(liveShape);
            return "";
        })();

        const resolvedHandles: HandleSpec = (() => {
            const h = options?.handles;
            if (typeof h === "function") return h(safeData);
            if (h && h.targets && h.sources) return h as HandleSpec;
            const targetCount = options?.targetHandles ?? 1;
            return {
                targets: Array.from({ length: targetCount }).map((_, i) => `in-${i}`),
                sources: ["out-0"]
            };
        })();

        const handleDelete = (e: React.MouseEvent) => {
            e.stopPropagation();
            setNodes(nodes => nodes.filter(n => n.id !== id));
            setEdges(eds => eds.filter(edge => edge.source !== id && edge.target !== id));
        };

        return (
            <div
                className="layer-node"
                style={{
                    backgroundColor: isHighlighted ? "#27210d" : "#222",
                    border: isHighlighted ? "1px solid #f1c40f" : isExpanded ? "1px solid #64ffda" : "1px solid #555",
                    borderRadius: "8px",
                    minWidth: "170px",
                    transition: "all 0.2s",
                    position: "relative",
                    boxShadow: isHighlighted
                        ? "0 0 0 2px #f1c40f, 0 0 20px #f1c40f66"
                        : undefined,
                    transform: isHighlighted ? "translateY(-2px) scale(1.01)" : undefined
                }}
            >
                {renderHandles("left", resolvedHandles.targets, isConnectable)}
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
                    <span>{label}</span>
                    <button
                        className="nodrag"
                        onClick={handleDelete}
                        style={{
                            marginLeft: "8px",
                            cursor: "pointer",
                            border: "none",
                            background: "transparent",
                            color: "#888",
                            fontWeight: "bold",
                            fontSize: "18px",
                            lineHeight: "18px",
                            width: "24px",
                            height: "24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                        }}
                        aria-label="Delete node"
                        title="Delete node"
                    >
                        ×
                    </button>
                </div>

                <ParamsList
                    renderKeys={renderList}
                    optionalParams={optionalParams}
                    paramSchema={paramSchema}
                    data={safeData}
                    onChange={onChange}
                    onExpand={() => setIsExpanded(true)}
                    hiddenCount={!isExpanded ? hiddenOptionCount : 0}
                />

                <div style={{ padding: "0 10px 10px", fontSize: "10px", color: "#888" }}>
                    Shape: {shapePreview}
                </div>
                {renderHandles("right", resolvedHandles.sources, isConnectable)}
            </div>
        );
    };
}
