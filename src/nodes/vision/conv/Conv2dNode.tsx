import { buildInitString, getParamValue, type FieldSpec } from "../../../node_gen/BaseClass";
import { createLayerComponent } from "../../../node_gen/CreateNodeComponent.tsx";

type Conv2dData = {
    in_channels: number;
    out_channels: number;
    kernel_size: number;
    stride?: number;
    padding?: number;
    bias?: boolean;
};

export class Conv2dNode {
    static label = "Conv2d";
    static paramSchema: Record<string, FieldSpec> = {
        in_channels: { required: true, type: "number", label: "In-Channels", defaultValue: 1, step: 1 },
        out_channels: { required: true, type: "number", label: "Out-Channels", defaultValue: 1, step: 1 },
        kernel_size: { required: true, type: "number", label: "Kernel Size", defaultValue: 3, step: 1 },
        stride: { required: false, type: "number", label: "Stride", defaultValue: 1, step: 1 },
        padding: { required: false, type: "number", label: "Padding", defaultValue: 0, step: 1 },
        bias: { required: false, type: "boolean", label: "Bias", defaultValue: true }
    };

    static shapeVerifier(data: Conv2dData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Conv2d expects exactly one input" };
        const shape = inputShapes[0];
        if (shape.length !== 4) return { ok: false as const, error: "Conv2d input must be [batch, channels, height, width]" };

        const [, channels, height, width] = shape;
        const inCh = getParamValue(this, data, "in_channels") as number;
        const outCh = getParamValue(this, data, "out_channels") as number;
        const kernel = getParamValue(this, data, "kernel_size") as number;
        const stride = getParamValue(this, data, "stride") as number;
        const padding = getParamValue(this, data, "padding") as number;

        if (inCh <= 0 || outCh <= 0) return { ok: false as const, error: "in/out channels must be > 0" };
        if (channels !== inCh) return { ok: false as const, error: `Expected ${inCh} channels, got ${channels}` };
        if (kernel <= 0) return { ok: false as const, error: "kernel_size must be > 0" };
        if (stride <= 0) return { ok: false as const, error: "stride must be > 0" };
        if (kernel > height + 2 * padding || kernel > width + 2 * padding) {
            return { ok: false as const, error: "kernel_size exceeds padded spatial dims" };
        }
        return { ok: true as const };
    }

    static shapeCompute(data: Conv2dData, inputShapes: number[][]) {
        const [batch, , height, width] = inputShapes[0] || [1, 1, 1, 1];
        const outCh = getParamValue(this, data, "out_channels") as number;
        const kernel = getParamValue(this, data, "kernel_size") as number;
        const stride = getParamValue(this, data, "stride") as number;
        const padding = getParamValue(this, data, "padding") as number;
        const dilation = 1;
        const computeDim = (dim: number) => Math.floor((dim + 2 * padding - dilation * (kernel - 1) - 1) / stride + 1);
        return [batch, outCh, computeDim(height), computeDim(width)];
    }

    static getInitCode(data: Conv2dData, name: string) {
        return buildInitString("nn.Conv2d", name, Conv2dNode.paramSchema, data);
    }

    static getForwardCode(_data: Conv2dData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<Conv2dData>(Conv2dNode.label, Conv2dNode.paramSchema);
}
