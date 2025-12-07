import { buildInitString, createLayerComponent, getParamValue, type FieldSpec } from "./BaseClass";

//class torch.nn.Conv2d(
//     in_channels: int,
//     out_channels: int,
//     kernel_size: _size_2_t,
//     stride: _size_2_t = 1,
//     padding: Union[str, _size_2_t] = 0,
//     dilation: _size_2_t = 1,
//     groups: int = 1,
//     bias: bool = True,
//     padding_mode: Literal["zeros", "reflect", "replicate", "circular"] = "zeros",
//     device=None,
//     dtype=None,
//) 

type CNNLayerData = {
    in_channels: number,
    out_channels: number,
    kernel_size: number,
    stride?: number,
    // padding?: number,
    // dilation?: number, 
    // groups?: number
    bias?: boolean,
    padding_mode?: string,

}

export class CNNLayerNode {
    static label = "Convolutional Layer"
    static paramSchema: Record<string, FieldSpec> = {
        in_channels: {
            required: true,
            type: 'number',
            label: "In-Channels",
            defaultValue: 1,
            step: 1
        },
        out_channels: {
            required: true,
            type: 'number',
            label: "Out-Channels",
            defaultValue: 1,
            step: 1
        },
        kernel_size: {
            required: true,
            type: 'number',
            label: "Kernel Size",
            defaultValue: 1,
            step: 1
        },
        stride: {
            required: false,
            type: 'number',
            label: "Stride",
            defaultValue: 1,
            step: 1
        },
        bias: {
            required: false,
            type: 'boolean',
            label: "Bias",
            defaultValue: true
        },
        padding_mode: {
            required: false,
            type: 'select',
            options: ["zeros", "reflect", "replicate", "circular"],
            defaultValue: "zeros"
        }
    }
    static shapeVerifier(data: CNNLayerData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Conv2d expects exactly one input" };
        const shape = inputShapes[0];
        if (shape.length !== 4) return { ok: false as const, error: "Conv2d input must be [batch, channels, height, width]" };

        const [batch, channels, height, width] = shape;
        if (batch <= 0) return { ok: false as const, error: "Batch dimension must be > 0" };
        const inCh = getParamValue(CNNLayerNode.paramSchema, data, "in_channels") as number;
        const outCh = getParamValue(CNNLayerNode.paramSchema, data, "out_channels") as number;
        const kernel = getParamValue(CNNLayerNode.paramSchema, data, "kernel_size") as number;
        const stride = getParamValue(CNNLayerNode.paramSchema, data, "stride") as number;

        if (inCh <= 0 || outCh <= 0) return { ok: false as const, error: "in_channels and out_channels must be > 0" };
        if (channels !== inCh) return { ok: false as const, error: `Expected ${inCh} channels, got ${channels}` };
        if (kernel <= 0) return { ok: false as const, error: "kernel_size must be > 0" };
        if (stride <= 0) return { ok: false as const, error: "stride must be > 0" };
        if (kernel > height || kernel > width) return { ok: false as const, error: `kernel_size=${kernel} exceeds input spatial dims (${height}x${width})` };

        return { ok: true as const };
    }
    static shapeCompute(data: CNNLayerData, inputShapes: number[][]) {
        const [batch, , height, width] = inputShapes[0] || [1, 1, 1, 1];
        const outCh = getParamValue(CNNLayerNode.paramSchema, data, "out_channels") as number;
        const kernel = getParamValue(CNNLayerNode.paramSchema, data, "kernel_size") as number;
        const stride = getParamValue(CNNLayerNode.paramSchema, data, "stride") as number;
        const padding = 0;
        const dilation = 1;

        const computeDim = (dim: number) => Math.floor((dim + 2 * padding - dilation * (kernel - 1) - 1) / stride + 1);
        const outH = computeDim(height);
        const outW = computeDim(width);
        return [batch, outCh, outH, outW];
    }
    static computeShape(data: CNNLayerData) {
        return [data.out_channels]
    }
    static getInitCode(data: CNNLayerData, name: string) {
        return buildInitString("nn.Conv2d", name, CNNLayerNode.paramSchema, data)
    }
    static getForwardCode(data: CNNLayerData, name: string, inputs: string[]) {
        data = data
        return `x = self.${name}(${inputs[0] || 'x'})`
    }
    static Component = createLayerComponent<CNNLayerData>(
        CNNLayerNode.label,
        CNNLayerNode.paramSchema,
        CNNLayerNode.computeShape
    );
}
