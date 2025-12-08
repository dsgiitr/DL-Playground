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
    handles?: HandleSpec | HandleFactory<D>;
    // Pure functions
    // shapeVerifier: checks compatibility of incoming shapes/params, must NOT modify data
    shapeVerifier(data: D, inputShapes: number[][]): { ok: true } | { ok: false; error: string };
    // shapeCompute: computes output shape, assumes verifier passed
    shapeCompute(data: D, inputShapes: number[][]): number[];
    getInitCode(data: D, name: string): string;
    getForwardCode(data: D, name: string, inputs: Array<string>, outputs: Array<string>): string;
    // UI component
    // Choose a design choice to make the Component a class reference or an instance reference
    // highly leaning towards making it an instance reference
    // abstract away the component updation process into its own function and keep the default component here
    // the component updation process will be dependant on the specific data while first creation should be component specific
    Component: React.ComponentType<NodeProps<any>>;
}

type HandleSpec = {
    targets: string[];
    sources: string[];
};
type HandleFactory<D> = (data: D) => HandleSpec;

// Utility: get a parameter value with default fallback from schema
type HasParamSchema = { paramSchema: Record<string, FieldSpec> };

export function getParamValue<D extends LayerData, K extends keyof D & string>(
    schemaOrLayer: Record<string, FieldSpec> | HasParamSchema,
    data: Partial<D> | undefined,
    key: K
): D[K] | FieldSpec["defaultValue"] {
    const schema = (schemaOrLayer as HasParamSchema).paramSchema ?? (schemaOrLayer as Record<string, FieldSpec>);
    const spec = schema[key];
    const val = data?.[key];
    if (spec?.type === "number") {
        return typeof val === "number" && !Number.isNaN(val) ? val : spec?.defaultValue;
    }
    return val !== undefined ? val : spec?.defaultValue;
}

export function InputControl({
    paramKey,
    spec,
    value,
    onChange
}: {
    paramKey: string;
    spec: FieldSpec;
    value: any;
    onChange: (key: string, type: FieldType) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}) {
    const isOptional = !spec.required;
    const style = (isOptional && value !== undefined)
        ? {
              width: "60px",
              backgroundColor: "#111",
              border: "1px solid #64ffda",
              color: "white",
              borderRadius: "4px",
              padding: "2px 4px",
              fondSize: "11px"
          }
        : {
              width: "60px",
              backgroundColor: "#111",
              border: "1px solid #444",
              color: "white",
              borderRadius: "4px",
              padding: "2px 4px",
              fondSize: "11px"
          };
    switch (spec.type) {
        case "boolean":
            return (
                <input
                    className="nodrag"
                    type="checkbox"
                    checked={!!value}
                    onChange={onChange(paramKey, "boolean")}
                    style={{ cursor: "pointer" }}
                />
            );
        case "select":
            return (
                <select
                    className="nodrag"
                    value={value ?? ""}
                    onChange={onChange(paramKey, "select")}
                    style={{ ...style, width: "80px" }}
                >
                    <option value="" disabled>...</option>
                    {spec.options?.map(opt => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            );
        case "text":
            return (
                <input
                    className="nodrag"
                    type="text"
                    value={value ?? ""}
                    onChange={onChange(paramKey, "text")}
                    style={{ ...style, width: "80px" }}
                />
            );
        case "number":
            return (
                <input
                    className="nodrag"
                    type="number"
                    step={spec.step || 1}
                    value={value ?? ""}
                    onChange={onChange(paramKey, "number")}
                    placeholder={isOptional ? "" : "0"}
                    style={style}
                />
            );
    }
}

export function ParamsList<D>({
    renderKeys,
    optionalParams,
    paramSchema,
    data,
    onChange,
    onExpand,
    hiddenCount
}: {
    renderKeys: string[];
    optionalParams: string[];
    paramSchema: Record<string, FieldSpec>;
    data: D;
    onChange: (key: string, type: FieldType) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onExpand: () => void;
    hiddenCount: number;
}) {
    return (
        <div style={{ padding: "10px" }}>
            {renderKeys.map(key => {
                const spec = paramSchema[key];
                if (!spec) return null;
                return (
                    <div
                        key={key}
                        style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", alignItems: "center" }}
                    >
                        <label style={{ fontSize: "11px", color: optionalParams.includes(key) ? "#aaa" : "#fff" }}>
                            {spec.label || key}
                        </label>
                        <InputControl paramKey={key} spec={spec} value={(data as any)[key]} onChange={onChange} />
                    </div>
                );
            })}
            {hiddenCount > 0 && (
                <div onClick={onExpand} style={{ fontSize: "9px", color: "#666", textAlign: "center", cursor: "pointer" }}>
                    + {hiddenCount} options
                </div>
            )}
        </div>
    );
}

export function renderHandles(side: "left" | "right", ids: string[], isConnectable: boolean) {
    return ids.map((idLabel, i, arr) => {
        const topPct = `${((i + 1) / (arr.length + 1)) * 100}%`;
        const isLeft = side === "left";
        return (
            <div
                key={`${side}-${idLabel}`}
                style={{
                    position: "absolute",
                    [isLeft ? "left" : "right"]: -24,
                    top: topPct,
                    transform: "translateY(-50%)",
                    display: "flex",
                    alignItems: "center"
                }}
            >
                <Handle
                    id={idLabel}
                    type={isLeft ? "target" : "source"}
                    position={isLeft ? Position.Left : Position.Right}
                    isConnectable={isConnectable}
                    style={{
                        background: "#777",
                        border: "1px solid #222"
                    }}
                />
            </div>
        );
    });
}

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
