import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { useMemo, useState } from "react";
//TODO: refactor the createlayercomponent to be modular and seperate change handling and input handling into sections
//TODO: work out the forward pass code
export type FieldType = 'number' | 'text' | 'boolean' | 'select'
export interface FieldSpec {
    type: FieldType;
    required: boolean;
    label?: string;
    options?: string[];
    defaultValue?: any;
    step?: number;
}
type LayerData = Record<string, any>;

// These are static class level information required
export interface LayerDefinition<D extends LayerData> {
    // Class configurations
    label: string;
    paramSchema: Record<string, FieldSpec>;
    // Pure functions
    computeShape(data: D, inputs?: any): number[];
    getInitCode(data: D, name: string): string;
    getInitCode(data: D, name: string): string;
    getForwardCode(data: D, name: string, inputs: Array<string>, outputs: Array<string>): string;
    // UI component
    Component: React.ComponentType<NodeProps<any>>;
}

export function createLayerComponent<D extends LayerData>(
    label: string,
    paramSchema: Record<string, FieldSpec>,
    shapeFn: (data: D) => number[]
) {
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
                <Handle type="target" position={Position.Left} isConnectable={isConnectable} />
                <div
                    // onClick={() => setIsExpanded(!isExpanded)}
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
                {/* Shape function */}
                <div style={{ padding: "0 10px 10px", fontSize: "10px", color: "#888" }}>
                    Shape: {JSON.stringify(shapeFn(safeData))}
                </div>
                <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
            </div>
        );
    };
}
export function buildInitString(
    className: string,
    name: string,
    schema: Record<string, FieldSpec>,
    data: Record<string, any>
) {
    const args: string[] = [];
    Object.keys(schema).forEach(key => {
        const spec = schema[key];
        const value = data[key];
        const toPython = (val: any) => {
            if (spec.type === 'boolean') return val ? 'True' : 'False';
            if (spec.type === 'select' || spec.type === 'text') return `${val}`
            return val
        };

        if (spec.required) {
            const valToUse = value !== undefined ? value : spec.defaultValue;
            // args.push(toPython(valToUse));
            args.push(`${key}=${toPython(valToUse)}`)
        } else {
            if (value !== undefined && value !== spec.defaultValue) {
                args.push(`${key}=${toPython(value)}`)
            }
        }
    })
    return `self.${name} = ${className}(${args.join(', ')})`
}