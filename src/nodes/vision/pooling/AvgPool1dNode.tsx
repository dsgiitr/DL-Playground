import { getParamValue, type FieldSpec } from "../../../node_gen/BaseClass";
import { createLayerComponent } from "../../../node_gen/CreateNodeComponent.tsx";

type PoolData = { kernel_size: number; stride?: number };

export class AvgPool1dNode {
    static label = "AvgPool1d";
    static paramSchema: Record<string, FieldSpec> = {
        kernel_size: { required: true, type: "number", label: "Kernel", defaultValue: 2, step: 1 },
        stride: { required: false, type: "number", label: "Stride", defaultValue: 2, step: 1 },
    };

    static shapeVerifier(data: PoolData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "AvgPool1d expects exactly one input" };
        const shape = inputShapes[0];
        if (shape.length !== 3) return { ok: false as const, error: "Input must be [batch, channels, length]" };
        const [, , l] = shape;
        const k = getParamValue(this, data, "kernel_size") as number;
        const s = getParamValue(this, data, "stride") as number;
        if (k <= 0 || s <= 0) return { ok: false as const, error: "kernel_size/stride must be > 0" };
        if (k > l) return { ok: false as const, error: `kernel_size=${k} exceeds input length ${l}` };
        return { ok: true as const };
    }

    static shapeCompute(data: PoolData, inputShapes: number[][]) {
        const [n, c, l] = inputShapes[0];
        const k = getParamValue(this, data, "kernel_size") as number;
        const s = getParamValue(this, data, "stride") as number;
        const padding = 0;
        const dilation = 1;
        const outL = Math.floor((l + 2 * padding - dilation * (k - 1) - 1) / s + 1);
        return [n, c, outL];
    }

    static getInitCode(data: PoolData, name: string) {
        const k = getParamValue(AvgPool1dNode.paramSchema, data, "kernel_size");
        const s = getParamValue(AvgPool1dNode.paramSchema, data, "stride");
        return `self.${name} = nn.AvgPool1d(kernel_size=${k}, stride=${s})`;
    }

    static getForwardCode(_data: PoolData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<PoolData>(AvgPool1dNode.label, AvgPool1dNode.paramSchema);
}
