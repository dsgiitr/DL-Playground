import { buildInitString, createLayerComponent, type FieldSpec } from "./BaseClass";

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