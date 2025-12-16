import { getParamValue, type FieldSpec } from "../../../node_gen/BaseClass";
import { createLayerComponent } from "../../../node_gen/CreateNodeComponent.tsx";

type AdaptivePoolData = { output_size: number };

export class AdaptiveMaxPool2dNode {
    static label = "AdaptiveMaxPool2d";
    static paramSchema: Record<string, FieldSpec> = {
        output_size: { required: true, type: "number", label: "Output Size", defaultValue: 1, step: 1 }
    };

    static shapeVerifier(data: AdaptivePoolData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "AdaptiveMaxPool2d expects one input" };
        const shape = inputShapes[0];
        if (shape.length !== 4) return { ok: false as const, error: "Input must be [batch, channels, height, width]" };
        const out = getParamValue(this, data, "output_size") as number;
        if (!Number.isInteger(out) || out <= 0) return { ok: false as const, error: "Output size must be a positive integer" };
        return { ok: true as const };
    }

    static shapeCompute(data: AdaptivePoolData, inputShapes: number[][]) {
        const [n, c] = inputShapes[0];
        const out = getParamValue(this, data, "output_size") as number;
        return [n, c, out, out];
    }

    static getInitCode(data: AdaptivePoolData, name: string) {
        const out = getParamValue(AdaptiveMaxPool2dNode.paramSchema, data, "output_size");
        return `self.${name} = nn.AdaptiveMaxPool2d(${out})`;
    }

    static getForwardCode(_data: AdaptivePoolData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<AdaptivePoolData>(AdaptiveMaxPool2dNode.label, AdaptiveMaxPool2dNode.paramSchema);
}
