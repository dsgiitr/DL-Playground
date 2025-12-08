import { createLayerComponent, getParamValue, type FieldSpec } from "../node_gen/BaseClass";

type PoolData = {
    kernel_size: number;
    stride?: number;
};

export class MaxPool2dNode {
    static label = "MaxPool2d";
    static paramSchema: Record<string, FieldSpec> = {
        kernel_size: { required: true, type: "number", label: "Kernel", defaultValue: 2, step: 1 },
        stride: { required: false, type: "number", label: "Stride", defaultValue: 2, step: 1 },
    };

    static shapeVerifier(data: PoolData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "MaxPool2d expects exactly one input" };
        const shape = inputShapes[0];
        if (shape.length !== 4) return { ok: false as const, error: "MaxPool2d input must be [batch, channels, height, width]" };
        const [, , h, w] = shape;
        const k = getParamValue(this, data, "kernel_size") as number;
        const s = getParamValue(this, data, "stride") as number;
        if (k <= 0) return { ok: false as const, error: "kernel_size must be > 0" };
        if (s <= 0) return { ok: false as const, error: "stride must be > 0" };
        if (k > h || k > w) return { ok: false as const, error: `kernel_size=${k} exceeds input spatial dims (${h}x${w})` };
        return { ok: true as const };
    }

    static shapeCompute(data: PoolData, inputShapes: number[][]) {
        const [n, c, h, w] = inputShapes[0];
        const k = getParamValue(this, data, "kernel_size") as number;
        const s = getParamValue(this, data, "stride") as number;
        const padding = 0;
        const dilation = 1;
        const computeDim = (dim: number) => Math.floor((dim + 2 * padding - dilation * (k - 1) - 1) / s + 1);
        return [n, c, computeDim(h), computeDim(w)];
    }

    static getInitCode(data: PoolData, name: string) {
        const k = getParamValue(MaxPool2dNode.paramSchema, data, "kernel_size");
        const s = getParamValue(MaxPool2dNode.paramSchema, data, "stride");
        return `self.${name} = nn.MaxPool2d(kernel_size=${k}, stride=${s})`;
    }

    static getForwardCode(_data: PoolData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static computeShape(_data: PoolData) {
        return [];
    }

    static Component = createLayerComponent<PoolData>(MaxPool2dNode.label, MaxPool2dNode.paramSchema);
}
