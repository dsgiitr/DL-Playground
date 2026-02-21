import { getParamValue, type FieldSpec } from "../../../node_gen/BaseClass";
import { estimateElementwiseCost } from "../../../utils/computeUtils";
import { createLayerComponent } from "../../../node_gen/CreateNodeComponent.tsx";

type UpsampleData = {
    scale_factor?: number;
    mode?: "nearest" | "bilinear" | "bicubic";
};

export class UpsampleNode {
    static label = "Upsample";
    static paramSchema: Record<string, FieldSpec> = {
        scale_factor: { required: true, type: "number", label: "Scale", defaultValue: 2 },
        mode: { required: false, type: "select", label: "Mode", options: ["nearest", "bilinear", "bicubic"], defaultValue: "nearest" }
    };

    static shapeVerifier(data: UpsampleData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Upsample expects one input" };
        const shape = inputShapes[0];
        if (shape.length < 3) return { ok: false as const, error: "Expected at least [N,C,H] shape" };
        const scale = getParamValue(this, data, "scale_factor") as number;
        if (!Number.isFinite(scale) || scale <= 0) return { ok: false as const, error: "Scale must be > 0" };
        return { ok: true as const };
    }

    static shapeCompute(data: UpsampleData, inputShapes: number[][]) {
        const shape = [...(inputShapes[0] || [])];
        const scale = getParamValue(this, data, "scale_factor") as number;
        if (shape.length >= 3) {
            shape[shape.length - 1] = Math.floor(shape[shape.length - 1] * scale);
            shape[shape.length - 2] = Math.floor(shape[shape.length - 2] * scale);
        }
        return shape;
    }

    static estimateCost(_data: UpsampleData, _inputShapes: number[][], outputShape: number[]) {
        return estimateElementwiseCost(outputShape);
    }

    static getInitCode(data: UpsampleData, name: string) {
        const scale = getParamValue(UpsampleNode.paramSchema, data, "scale_factor");
        const mode = getParamValue(UpsampleNode.paramSchema, data, "mode");
        return `self.${name} = nn.Upsample(scale_factor=${scale}, mode="${mode}")`;
    }

    static getForwardCode(_data: UpsampleData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<UpsampleData>(UpsampleNode.label, UpsampleNode.paramSchema);
}
