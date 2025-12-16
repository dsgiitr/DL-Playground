import { buildInitString, getParamValue, type FieldSpec } from "../../../node_gen/BaseClass";
import { createLayerComponent } from "../../../node_gen/CreateNodeComponent.tsx";

type PointwiseData = {
    in_channels: number;
    out_channels: number;
    bias?: boolean;
};

export class PointwiseConv2dNode {
    static label = "PointwiseConv2d";
    static paramSchema: Record<string, FieldSpec> = {
        in_channels: { required: true, type: "number", label: "In-Channels", defaultValue: 1, step: 1 },
        out_channels: { required: true, type: "number", label: "Out-Channels", defaultValue: 1, step: 1 },
        bias: { required: false, type: "boolean", label: "Bias", defaultValue: true }
    };

    static shapeVerifier(data: PointwiseData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "PointwiseConv2d expects one input" };
        const shape = inputShapes[0];
        if (shape.length !== 4) return { ok: false as const, error: "Input must be [N,C,H,W]" };
        const [, channels] = shape;
        const inCh = getParamValue(this, data, "in_channels") as number;
        const outCh = getParamValue(this, data, "out_channels") as number;
        if (channels !== inCh) return { ok: false as const, error: `Expected ${inCh} channels, got ${channels}` };
        if (inCh <= 0 || outCh <= 0) return { ok: false as const, error: "Channels must be > 0" };
        return { ok: true as const };
    }

    static shapeCompute(data: PointwiseData, inputShapes: number[][]) {
        const [batch, , h, w] = inputShapes[0];
        const outCh = getParamValue(this, data, "out_channels") as number;
        return [batch, outCh, h, w];
    }

    static getInitCode(data: PointwiseData, name: string) {
        return buildInitString("nn.Conv2d", name, {
            ...PointwiseConv2dNode.paramSchema,
            kernel_size: { required: true, type: "number", label: "Kernel Size", defaultValue: 1 },
            stride: { required: true, type: "number", label: "Stride", defaultValue: 1 },
            padding: { required: true, type: "number", label: "Padding", defaultValue: 0 }
        }, { ...data, kernel_size: 1, stride: 1, padding: 0 } as any);
    }

    static getForwardCode(_data: PointwiseData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<PointwiseData>(PointwiseConv2dNode.label, PointwiseConv2dNode.paramSchema);
}
