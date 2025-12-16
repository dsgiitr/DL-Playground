import { getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type PowData = { exponent?: number };

export class PowNode {
    static label = "Pow";
    static paramSchema: Record<string, FieldSpec> = {
        exponent: { required: true, type: "number", label: "Exponent", defaultValue: 2, step: 1 }
    };

    static shapeVerifier(_data: PowData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Pow expects one input" };
        const shape = inputShapes[0];
        if (!Array.isArray(shape) || !shape.length) return { ok: false as const, error: "Input shape must be defined" };
        return { ok: true as const };
    }

    static shapeCompute(_data: PowData, inputShapes: number[][]) {
        return [...(inputShapes[0] || [])];
    }

    static getInitCode() {
        return "# pow uses functional torch.pow";
    }

    static getForwardCode(data: PowData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const out = outputs[0] || "x";
        const inputVar = inputs[0] || "x";
        const exp = getParamValue(PowNode.paramSchema, data, "exponent");
        return `${out} = torch.pow(${inputVar}, ${exp})`;
    }

    static Component = createLayerComponent<PowData>(PowNode.label, PowNode.paramSchema);
}
