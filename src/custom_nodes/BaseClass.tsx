import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { useMemo, useState } from "react";
//TODO: refactor the createlayercomponent to be modular and seperate change handling and input handling into sections
//TODO: make the createlayercomponent dependant on data such as number of handles
//      (can be done by implementing functions which compute the number of handles by looking at the data and the inputs as well)
//TODO: implement handle naming instead of edge naming or link the 2 on the frontend
//      (unsure if this is needed inside the node or not)
//TODO: during initial instantiation, data is not provided so use the param schema defaults to start
//TODO: work out the base implementation for forward pass
//TODO: add edge functionality (right now we only have node functionality)
//TODO: add functionality on the frontend to change the name of layer by the user. this "layer_name" property should update the node data
//      (this "layer_name" property will be used by forward and init code)
//TODO: when a new node is instantiated, its node data should become populated with default values and default names
//TODO: inside edge functionality we want the edges to describe which handle they originate from and which edge they go towards.
//TODO: the shape compute function may become the property of the handles themselves for more complicated modules. 
export type FieldType = 'number' | 'text' | 'boolean' | 'select' // This describes how user can input a param's value
export interface FieldSpec {
    // This defines all the essential requirements of a parameter that a schema should follow
    type: FieldType;
    required: boolean;
    label?: string;
    options?: string[];
    defaultValue?: any;
    step?: number;
}
type LayerData = Record<string, any>;

// These are static class level static function implementation
// all attributes and methods MUST be static in nature to the class
export interface LayerDefinition<D extends LayerData> {

    // Class configurations
    label: string;
    paramSchema: Record<string, FieldSpec>;
    // Pure functions
    computeShape(data: D, inputs?: any): number[];
    getInitCode(data: D, name: string): string;
    getForwardCode(name: string, inputs: string[], outputs: string[], data?: D): string;
    // UI component
    // Choose a design choice to make the Component a class reference or an instance reference
    // highly leaning towards making it an instance reference
    // abstract away the component updation process into its own function and keep the default component here
    // the component updation process will be dependant on the specific data while first creation should be component specific
    Component: React.ComponentType<NodeProps<any>>;
}

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
// This is a base implementation of the init code that can dynamically update
//  depending on if the value has been changed to a non default param value
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

// A base implementation of forward pass code is also required here since most layers will behave almost exactly the same way
