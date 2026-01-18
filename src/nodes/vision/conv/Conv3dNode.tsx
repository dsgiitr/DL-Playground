import { buildInitString, getParamValue, type FieldSpec } from "../../../node_gen/BaseClass";
import { estimateConvCost, toNumber } from "../../../utils/computeUtils";
import { createLayerComponent } from "../../../node_gen/CreateNodeComponent.tsx";

type Conv3dData = {
    in_channels: number;
    out_channels: number;
    kernel_size: number;
    stride?: number;
    padding?: number;
    bias?: boolean;
};

export class Conv3dNode {
    static label = "Conv3d";
    static paramSchema: Record<string, FieldSpec> = {
        in_channels: { required: true, type: "number", label: "In-Channels", defaultValue: 1, step: 1 },
        out_channels: { required: true, type: "number", label: "Out-Channels", defaultValue: 1, step: 1 },
        kernel_size: { required: true, type: "number", label: "Kernel Size", defaultValue: 3, step: 1 },
        stride: { required: false, type: "number", label: "Stride", defaultValue: 1, step: 1 },
        padding: { required: false, type: "number", label: "Padding", defaultValue: 0, step: 1 },
        bias: { required: false, type: "boolean", label: "Bias", defaultValue: true }
    };

    static shapeVerifier(data: Conv3dData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Conv3d expects exactly one input" };
        const shape = inputShapes[0];
        if (shape.length !== 5) return { ok: false as const, error: "Conv3d input must be [batch, channels, depth, height, width]" };

        const [, channels, depth, height, width] = shape;
        const inCh = getParamValue(this, data, "in_channels") as number;
        const outCh = getParamValue(this, data, "out_channels") as number;
        const kernel = getParamValue(this, data, "kernel_size") as number;
        const stride = getParamValue(this, data, "stride") as number;
        const padding = getParamValue(this, data, "padding") as number;

        if (inCh <= 0 || outCh <= 0) return { ok: false as const, error: "in/out channels must be > 0" };
        if (channels !== inCh) return { ok: false as const, error: `Expected ${inCh} channels, got ${channels}` };
        if (kernel <= 0) return { ok: false as const, error: "kernel_size must be > 0" };
        if (stride <= 0) return { ok: false as const, error: "stride must be > 0" };
        if (kernel > depth + 2 * padding || kernel > height + 2 * padding || kernel > width + 2 * padding) {
            return { ok: false as const, error: "kernel_size exceeds padded spatial dims" };
        }
        return { ok: true as const };
    }

    static shapeCompute(data: Conv3dData, inputShapes: number[][]) {
        const [batch, , depth, height, width] = inputShapes[0] || [1, 1, 1, 1, 1];
        const outCh = getParamValue(this, data, "out_channels") as number;
        const kernel = getParamValue(this, data, "kernel_size") as number;
        const stride = getParamValue(this, data, "stride") as number;
        const padding = getParamValue(this, data, "padding") as number;
        const dilation = 1;
        const computeDim = (dim: number) => Math.floor((dim + 2 * padding - dilation * (kernel - 1) - 1) / stride + 1);
        return [batch, outCh, computeDim(depth), computeDim(height), computeDim(width)];
    }

    static estimateCost(data: Conv3dData, _inputShapes: number[][], outputShape: number[]) {
        const inCh = toNumber(getParamValue(this, data, "in_channels"), 0);
        const outCh = toNumber(getParamValue(this, data, "out_channels"), 0);
        const kernel = toNumber(getParamValue(this, data, "kernel_size"), 0);
        const bias = data.bias !== false;
        const kernelVolume = kernel * kernel * kernel;
        return estimateConvCost(outputShape, inCh, outCh, kernelVolume, bias);
    }

    static getInitCode(data: Conv3dData, name: string) {
        return buildInitString("nn.Conv3d", name, Conv3dNode.paramSchema, data);
    }

    static getForwardCode(_data: Conv3dData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<Conv3dData>(Conv3dNode.label, Conv3dNode.paramSchema);
}
