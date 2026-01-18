import { getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
import { estimateElementwiseCost } from "../../utils/computeUtils";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type ClipData = { min?: number; max?: number };

export class ClipNode {
    static label = "Clip";
    static paramSchema: Record<string, FieldSpec> = {
        min: { required: false, type: "number", label: "Min", defaultValue: 0 },
        max: { required: false, type: "number", label: "Max", defaultValue: 1 }
    };

    static shapeVerifier(data: ClipData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Clip expects one input" };
        const shape = inputShapes[0];
        if (!Array.isArray(shape) || !shape.length) return { ok: false as const, error: "Input shape must be defined" };
        const min = getParamValue(this, data, "min") as number;
        const max = getParamValue(this, data, "max") as number;
        if (min !== undefined && max !== undefined && min > max) {
            return { ok: false as const, error: "Min cannot exceed max" };
        }
        return { ok: true as const };
    }

    static shapeCompute(_data: ClipData, inputShapes: number[][]) {
        return [...(inputShapes[0] || [])];
    }

    static estimateCost(_data: ClipData, _inputShapes: number[][], outputShape: number[]) {
        return estimateElementwiseCost(outputShape);
    }

    static getInitCode() {
        return "# clip uses torch.clamp";
    }

    static getForwardCode(data: ClipData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const out = outputs[0] || "x";
        const inputVar = inputs[0] || "x";
        const min = getParamValue(ClipNode.paramSchema, data, "min");
        const max = getParamValue(ClipNode.paramSchema, data, "max");
        const args: string[] = [];
        if (min !== undefined) args.push(`min=${min}`);
        if (max !== undefined) args.push(`max=${max}`);
        return `${out} = torch.clamp(${inputVar}${args.length ? ", " + args.join(", ") : ""})`;
    }

    static Component = createLayerComponent<ClipData>(ClipNode.label, ClipNode.paramSchema);
}
