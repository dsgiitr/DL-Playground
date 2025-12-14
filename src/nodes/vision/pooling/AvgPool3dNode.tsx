import { getParamValue, type FieldSpec } from "../../../node_gen/BaseClass";
import { createLayerComponent } from "../../../node_gen/CreateNodeComponent.tsx";

type PoolData = { kernel_size: number; stride?: number };

export class AvgPool3dNode {
    static label = "AvgPool3d";
    static paramSchema: Record<string, FieldSpec> = {
        kernel_size: { required: true, type: "number", label: "Kernel", defaultValue: 2, step: 1 },
        stride: { required: false, type: "number", label: "Stride", defaultValue: 2, step: 1 },
    };

    static shapeVerifier(data: PoolData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "AvgPool3d expects exactly one input" };
        const shape = inputShapes[0];
        if (shape.length !== 5) return { ok: false as const, error: "Input must be [batch, channels, D, H, W]" };
        const [, , d, h, w] = shape;
        const k = getParamValue(this, data, "kernel_size") as number;
        const s = getParamValue(this, data, "stride") as number;
        if (k <= 0 || s <= 0) return { ok: false as const, error: "kernel_size/stride must be > 0" };
        if (k > d || k > h || k > w) return { ok: false as const, error: `kernel_size=${k} exceeds input dims` };
        return { ok: true as const };
    }

    static shapeCompute(data: PoolData, inputShapes: number[][]) {
        const [n, c, d, h, w] = inputShapes[0];
        const k = getParamValue(this, data, "kernel_size") as number;
        const s = getParamValue(this, data, "stride") as number;
        const padding = 0;
        const dilation = 1;
        const computeDim = (dim: number) => Math.floor((dim + 2 * padding - dilation * (k - 1) - 1) / s + 1);
        return [n, c, computeDim(d), computeDim(h), computeDim(w)];
    }

    static getInitCode(data: PoolData, name: string) {
        const k = getParamValue(AvgPool3dNode.paramSchema, data, "kernel_size");
        const s = getParamValue(AvgPool3dNode.paramSchema, data, "stride");
        return `self.${name} = nn.AvgPool3d(kernel_size=${k}, stride=${s})`;
    }

    static getForwardCode(_data: PoolData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<PoolData>(AvgPool3dNode.label, AvgPool3dNode.paramSchema);
}
