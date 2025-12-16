import { buildInitString, getParamValue, type FieldSpec } from "../../../node_gen/BaseClass";
import { createLayerComponent } from "../../../node_gen/CreateNodeComponent.tsx";

type ConvTData = {
    in_channels: number;
    out_channels: number;
    kernel_size: number;
    stride?: number;
    padding?: number;
    output_padding?: number;
    dilation?: number;
    bias?: boolean;
};

export class ConvTranspose2dNode {
    static label = "ConvTranspose2d";
    static paramSchema: Record<string, FieldSpec> = {
        in_channels: { required: true, type: "number", label: "In-Channels", defaultValue: 1, step: 1 },
        out_channels: { required: true, type: "number", label: "Out-Channels", defaultValue: 1, step: 1 },
        kernel_size: { required: true, type: "number", label: "Kernel Size", defaultValue: 3, step: 1 },
        stride: { required: false, type: "number", label: "Stride", defaultValue: 1, step: 1 },
        padding: { required: false, type: "number", label: "Padding", defaultValue: 0, step: 1 },
        output_padding: { required: false, type: "number", label: "Output Padding", defaultValue: 0, step: 1 },
        dilation: { required: false, type: "number", label: "Dilation", defaultValue: 1, step: 1 },
        bias: { required: false, type: "boolean", label: "Bias", defaultValue: true }
    };

    static shapeVerifier(data: ConvTData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "ConvTranspose2d expects one input" };
        const shape = inputShapes[0];
        if (shape.length !== 4) return { ok: false as const, error: "Input must be [N,C,H,W]" };
        const [, channels] = shape;
        const inCh = getParamValue(this, data, "in_channels") as number;
        const kernel = getParamValue(this, data, "kernel_size") as number;
        const stride = getParamValue(this, data, "stride") as number;
        const dilation = getParamValue(this, data, "dilation") as number;
        if (channels !== inCh) return { ok: false as const, error: `Expected ${inCh} channels, got ${channels}` };
        if (kernel <= 0 || stride <= 0 || dilation <= 0) return { ok: false as const, error: "kernel/stride/dilation must be > 0" };
        return { ok: true as const };
    }

    static shapeCompute(data: ConvTData, inputShapes: number[][]) {
        const [batch, , h, w] = inputShapes[0];
        const outCh = getParamValue(this, data, "out_channels") as number;
        const k = getParamValue(this, data, "kernel_size") as number;
        const s = getParamValue(this, data, "stride") as number;
        const p = getParamValue(this, data, "padding") as number;
        const d = getParamValue(this, data, "dilation") as number;
        const op = getParamValue(this, data, "output_padding") as number;
        const computeDim = (dim: number) => (dim - 1) * s - 2 * p + d * (k - 1) + op + 1;
        return [batch, outCh, computeDim(h), computeDim(w)];
    }

    static getInitCode(data: ConvTData, name: string) {
        return buildInitString("nn.ConvTranspose2d", name, ConvTranspose2dNode.paramSchema, data);
    }

    static getForwardCode(_data: ConvTData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<ConvTData>(ConvTranspose2dNode.label, ConvTranspose2dNode.paramSchema);
}
