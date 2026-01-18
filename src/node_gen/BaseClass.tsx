import { Handle, Position, type NodeProps } from "@xyflow/react";
import { type ComponentType } from "react";

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
export type LayerData = Record<string, any>;

// These are static class level static function implementation
// all attributes and methods MUST be static in nature to the class
export interface LayerDefinition<D extends LayerData> {

    // Class configurations
    label: string;
    paramSchema: Record<string, FieldSpec>;
    // Optional diagram metadata to avoid ad-hoc maps in renderers.
    diagramLabel?: string;
    diagramFamily?: "input" | "output" | "merge" | "activation" | "block" | "other";
    handles?: HandleSpec | HandleFactory<D>;
    // Pure functions
    // shapeVerifier: checks compatibility of incoming shapes/params, must NOT modify data
    shapeVerifier(data: D, inputShapes: number[][]): { ok: true } | { ok: false; error: string };
    // shapeCompute: computes output shape, assumes verifier passed
    shapeCompute(data: D, inputShapes: number[][]): number[];
    // estimateCost: optional params/FLOPs estimate for analysis panels
    estimateCost?: (data: D, inputShapes: number[][], outputShape: number[]) => { params: number; flops: number };
    getInitCode(data: D, name: string): string;
    getForwardCode(data: D, name: string, inputs: Array<string>, outputs: Array<string>): string;
    // UI component
    // Choose a design choice to make the Component a class reference or an instance reference
    // highly leaning towards making it an instance reference
    // abstract away the component updation process into its own function and keep the default component here
    // the component updation process will be dependant on the specific data while first creation should be component specific
    Component: ComponentType<NodeProps<any>>;
}

export type HandleSpec = {
    targets: string[];
    sources: string[];
};
export type HandleFactory<D> = (data: D) => HandleSpec;

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
                    [isLeft ? "left" : "right"]: -1,
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
