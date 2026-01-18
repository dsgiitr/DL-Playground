import { buildInitString, getParamValue, type FieldSpec } from "../../../node_gen/BaseClass";
import { estimateConvCost, toNumber } from "../../../utils/computeUtils";
import { createLayerComponent } from "../../../node_gen/CreateNodeComponent.tsx";

type Conv1dData = {
    in_channels: number;
    out_channels: number;
    kernel_size: number;
    stride?: number;
    padding?: number;
    bias?: boolean;
};

export class Conv1dNode {
    static label = "Conv1d";
    static paramSchema: Record<string, FieldSpec> = {
        in_channels: { required: true, type: "number", label: "In-Channels", defaultValue: 1, step: 1 },
        out_channels: { required: true, type: "number", label: "Out-Channels", defaultValue: 1, step: 1 },
        kernel_size: { required: true, type: "number", label: "Kernel Size", defaultValue: 3, step: 1 },
        stride: { required: false, type: "number", label: "Stride", defaultValue: 1, step: 1 },
        padding: { required: false, type: "number", label: "Padding", defaultValue: 0, step: 1 },
        bias: { required: false, type: "boolean", label: "Bias", defaultValue: true }
    };

    static shapeVerifier(data: Conv1dData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Conv1d expects exactly one input" };
        const shape = inputShapes[0];
        if (shape.length !== 3) return { ok: false as const, error: "Conv1d input must be [batch, channels, length]" };

        const [, channels, length] = shape;
        const inCh = getParamValue(this, data, "in_channels") as number;
        const outCh = getParamValue(this, data, "out_channels") as number;
        const kernel = getParamValue(this, data, "kernel_size") as number;
        const stride = getParamValue(this, data, "stride") as number;
        const padding = getParamValue(this, data, "padding") as number;

        if (inCh <= 0 || outCh <= 0) return { ok: false as const, error: "in/out channels must be > 0" };
        if (channels !== inCh) return { ok: false as const, error: `Expected ${inCh} channels, got ${channels}` };
        if (kernel <= 0) return { ok: false as const, error: "kernel_size must be > 0" };
        if (stride <= 0) return { ok: false as const, error: "stride must be > 0" };
        if (kernel > length + 2 * padding) return { ok: false as const, error: "kernel_size exceeds padded length" };
        return { ok: true as const };
    }

    static shapeCompute(data: Conv1dData, inputShapes: number[][]) {
        const [batch, , length] = inputShapes[0] || [1, 1, 1];
        const outCh = getParamValue(this, data, "out_channels") as number;
        const kernel = getParamValue(this, data, "kernel_size") as number;
        const stride = getParamValue(this, data, "stride") as number;
        const padding = getParamValue(this, data, "padding") as number;
        const dilation = 1;
        const outL = Math.floor((length + 2 * padding - dilation * (kernel - 1) - 1) / stride + 1);
        return [batch, outCh, outL];
    }

    static estimateCost(data: Conv1dData, _inputShapes: number[][], outputShape: number[]) {
        const inCh = toNumber(getParamValue(this, data, "in_channels"), 0);
        const outCh = toNumber(getParamValue(this, data, "out_channels"), 0);
        const kernel = toNumber(getParamValue(this, data, "kernel_size"), 0);
        const bias = data.bias !== false;
        return estimateConvCost(outputShape, inCh, outCh, kernel, bias);
    }

    static getInitCode(data: Conv1dData, name: string) {
        return buildInitString("nn.Conv1d", name, Conv1dNode.paramSchema, data);
    }

    static getForwardCode(_data: Conv1dData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<Conv1dData>(Conv1dNode.label, Conv1dNode.paramSchema);
}
