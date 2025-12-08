import { type LayerData, type FieldType, type FieldSpec } from "../node_gen/BaseClass";
import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { useMemo, useState } from "react";

export function createLayerComponent<D extends LayerData>(
    label: string,
    paramSchema: Record<string, FieldSpec>,
    shapeFn: (data: D) => number[]
) {
    // The core function that creates the frontend Layer node
    // needs to be refactored since it is too complicated and bulky


    return ({ id, data, isConnectable }: NodeProps<Node<any>>) => {
        const { setNodes } = useReactFlow();
        const [isExpanded, setIsExpanded] = useState(false);
        const safeData = data || {} as D;
        const { requiredParams, optionalParams } = useMemo(() => {
            const keys = Object.keys(paramSchema);
            const req = keys.filter(k => paramSchema[k].required);
            const opt = keys.filter(k => !paramSchema[k].required);
            return {
                requiredParams: req,
                optionalParams: opt
            }
        }, [])
        // This section handles the updation of node data based on user events
        const onChange = (key: string, type: FieldType) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            let newValue: any = e.target.value;
            if (type === 'number') {
                newValue = newValue === "" ? undefined : parseFloat(newValue);
            } else if (type === 'boolean') {
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
            )
        };
        // This function displays the input inside the input fields
        const renderInput = (key: string, spec: FieldSpec, value: any) => {
            const isOptional = !spec.required
            const commonStyle = {
                width: "60px",
                backgroundColor: "#111",
                border: "1px solid #444",
                color: "white", borderRadius: "4px",
                padding: "2px 4px", fondSize: "11px"
            };
            const highlightStyle = {
                ...commonStyle,
                border: "1px solid #64ffda"
            };
            const style = (isOptional && value !== undefined) ? highlightStyle : commonStyle;
            switch (spec.type) {
                case 'boolean':
                    return (
                        <input
                            className="nodrag"
                            type="checkbox"
                            checked={!!value}
                            onChange={onChange(key, 'boolean')}
                            style={{ cursor: "pointer" }}
                        />
                    );
                case 'select':
                    return (
                        <select
                            className="nodrag"
                            value={value ?? ""}
                            onChange={onChange(key, 'select')}
                            style={{ ...style, width: "80px" }}
                        >
                            <option value="" disabled>...</option>
                            {spec.options?.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    );
                case 'text':
                    return (
                        <input
                            className="nodrag"
                            type="text"
                            value={value ?? ""}
                            onChange={onChange(key, 'text')}
                            style={{ ...style, width: "80px" }}
                        />
                    );
                case 'number':
                    return (
                        <input
                            className="nodrag"
                            type="number"
                            step={spec.step || 1}
                            value={value ?? ""}
                            onChange={onChange(key, 'number')}
                            placeholder={isOptional ? "" : "0"}
                            style={style}
                        />
                    );
            }
        }
        const paramsToShow = new Set(requiredParams);
        optionalParams.forEach(key => {
            if (isExpanded || safeData[key] !== undefined) {
                paramsToShow.add(key);
            }
        })
        // list of params that will be rended if the paramsToShow has those optional params
        const renderList = [
            ...requiredParams,
            ...optionalParams.filter(k => paramsToShow.has(k))
        ]
        const hiddenOptionCount = optionalParams.length - (renderList.length - requiredParams.length);

        return (
            <div className="layer-node" style={{
                backgroundColor: "#222", border: isExpanded ? "1px solid #64ffda" : "1px solid #555",
                borderRadius: "8px", minWidth: "170px", transition: "all 0.2s"
            }}>
                {/* Currently all handles are hardcoded. this needs to be dependant on the data or the param scheme */}
                <Handle type="target" position={Position.Left} isConnectable={isConnectable} />
                <div
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        fontWeight: "bold", color: "#64ffda", borderBottom: "1px solid #444",
                        padding: "8px", cursor: "pointer", display: "flex", justifyContent: "space-between"
                    }}
                >
                    <span>{label}</span>
                    {/* <span style={{ fontSize: "10px" }}>{isExpanded ? "▼" : "▶"}</span> */}
                </div>

                <div style={{ padding: "10px" }}>
                    {renderList.map(key => {
                        const spec = paramSchema[key];
                        if (!spec) return null;

                        return (
                            <div key={key} style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", alignItems: "center" }}>
                                <label style={{ fontSize: "11px", color: optionalParams.includes(key) ? "#aaa" : "#fff" }}>
                                    {spec.label || key}
                                </label>
                                {renderInput(key, spec, safeData[key])}
                            </div>
                        )
                    })}
                    {!isExpanded && hiddenOptionCount > 0 && (
                        <div onClick={() => setIsExpanded(true)} style={{ fontSize: "9px", color: "#666", textAlign: "center", cursor: "pointer" }}>
                            + {hiddenOptionCount} options
                        </div>
                    )}
                </div>
                {/* Shape function is currently a placeholder for the actual shape computation since it is input dependant*/}
                <div style={{ padding: "0 10px 10px", fontSize: "10px", color: "#888" }}>
                    Shape: {JSON.stringify(shapeFn(safeData))}
                </div>
                <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
            </div>
        );
    };
}