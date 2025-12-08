import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { useMemo, useState } from "react";
import {type FieldSpec, type LayerData, type FieldType, type HandleSpec, type HandleFactory, renderHandles, ParamsList } from './BaseClass.tsx'

export function createLayerComponent<D extends LayerData>(
    label: string,
    paramSchema: Record<string, FieldSpec>,
    options?: { targetHandles?: number; handles?: HandleSpec | HandleFactory<D> }
) {
    return ({ id, data, isConnectable }: NodeProps<Node<any>>) => {
        const { setNodes, setEdges } = useReactFlow();
        const [isExpanded, setIsExpanded] = useState(false);
        const safeData = data || ({} as D);

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
            if (isExpanded || safeData[key] !== undefined) {
                paramsToShow.add(key);
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
                    backgroundColor: "#222",
                    border: isExpanded ? "1px solid #64ffda" : "1px solid #555",
                    borderRadius: "8px",
                    minWidth: "170px",
                    transition: "all 0.2s",
                    position: "relative"
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