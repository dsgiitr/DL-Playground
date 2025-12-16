import { getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";
import { makeReduction } from "./ReductionNode";

type DimData = { dim?: number };

const reduceShape = (shape: number[], dim: number) => {
    const rank = shape.length;
    const axis = dim < 0 ? rank + dim : dim;
    if (axis < 0 || axis >= rank) return null;
    const next = [...shape];
    next.splice(axis, 1);
    return next.length ? next : [1];
};

export const ProdNode = makeReduction("Prod", "prod");

export class MaxNode {
    static label = "Max";
    static paramSchema: Record<string, FieldSpec> = {
        dim: { required: true, type: "number", label: "Dim (default last)", defaultValue: -1, step: 1 }
    };
    static handles = { targets: ["in-0"], sources: ["out-0"] };

    static shapeVerifier(data: DimData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Max expects one input" };
        const shape = inputShapes[0];
        if (!Array.isArray(shape) || !shape.length) return { ok: false as const, error: "Input shape must be defined" };
        const dim = getParamValue(this, data, "dim") as number;
        const rank = shape.length;
        const axis = dim < 0 ? rank + dim : dim;
        if (axis < 0 || axis >= rank) return { ok: false as const, error: `Dim must be in [0, ${rank - 1}]` };
        return { ok: true as const };
    }

    static shapeCompute(data: DimData, inputShapes: number[][]) {
        const shape = inputShapes[0] || [];
        const dim = getParamValue(this, data, "dim") as number;
        return reduceShape(shape, dim) || [];
    }

    static getInitCode() {
        return "# max uses torch.max(...).values";
    }

    static getForwardCode(data: DimData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const out = outputs[0] || "x";
        const inputVar = inputs[0] || "x";
        const dim = getParamValue(this, data, "dim");
        return `${out} = torch.max(${inputVar}, dim=${dim}).values`;
    }

    static Component = createLayerComponent<DimData>(MaxNode.label, MaxNode.paramSchema);
}

export class MinNode {
    static label = "Min";
    static paramSchema: Record<string, FieldSpec> = MaxNode.paramSchema;
    static handles = { targets: ["in-0"], sources: ["out-0"] };

    static shapeVerifier = MaxNode.shapeVerifier;
    static shapeCompute = MaxNode.shapeCompute;
    static getInitCode() {
        return "# min uses torch.min(...).values";
    }
    static getForwardCode(data: DimData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const out = outputs[0] || "x";
        const inputVar = inputs[0] || "x";
        const dim = getParamValue(this, data, "dim");
        return `${out} = torch.min(${inputVar}, dim=${dim}).values`;
    }
    static Component = createLayerComponent<DimData>(MinNode.label, MinNode.paramSchema);
}

export class ArgMaxNode {
    static label = "ArgMax";
    static paramSchema: Record<string, FieldSpec> = MaxNode.paramSchema;
    static handles = { targets: ["in-0"], sources: ["out-0"] };

    static shapeVerifier = MaxNode.shapeVerifier;
    static shapeCompute = MaxNode.shapeCompute;
    static getInitCode() {
        return "# argmax uses torch.argmax";
    }
    static getForwardCode(data: DimData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const out = outputs[0] || "x";
        const inputVar = inputs[0] || "x";
        const dim = getParamValue(this, data, "dim");
        return `${out} = torch.argmax(${inputVar}, dim=${dim})`;
    }
    static Component = createLayerComponent<DimData>(ArgMaxNode.label, ArgMaxNode.paramSchema);
}

export class ArgMinNode {
    static label = "ArgMin";
    static paramSchema: Record<string, FieldSpec> = MaxNode.paramSchema;
    static handles = { targets: ["in-0"], sources: ["out-0"] };

    static shapeVerifier = MaxNode.shapeVerifier;
    static shapeCompute = MaxNode.shapeCompute;
    static getInitCode() {
        return "# argmin uses torch.argmin";
    }
    static getForwardCode(data: DimData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const out = outputs[0] || "x";
        const inputVar = inputs[0] || "x";
        const dim = getParamValue(this, data, "dim");
        return `${out} = torch.argmin(${inputVar}, dim=${dim})`;
    }
    static Component = createLayerComponent<DimData>(ArgMinNode.label, ArgMinNode.paramSchema);
}
