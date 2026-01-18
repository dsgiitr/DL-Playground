import { type FieldSpec } from "../../../node_gen/BaseClass";
import { createLayerComponent } from "../../../node_gen/CreateNodeComponent";
import { type HandleSchema } from "../../../types/handleTypes";

type DualOutputConvData = {
  in_channels?: number;
  out_channels?: number;
  kernel_size?: number;
};

/**
 * multi-output node: Applies Conv2d and outputs both the conv result
 * and a flattened version, demonstrating per-handle shape computation.
 */
export class DualOutputConvNode {
  static label = "DualConv (Conv+Flat)";

  static paramSchema: Record<string, FieldSpec> = {
    in_channels: {
      type: "number",
      required: true,
      defaultValue: 3,
      label: "In Channels",
    },
    out_channels: {
      type: "number",
      required: true,
      defaultValue: 64,
      label: "Out Channels",
    },
    kernel_size: {
      type: "number",
      required: true,
      defaultValue: 3,
      label: "Kernel Size",
    },
  };

  // Define handle schema with two outputs
  static handleSchema: HandleSchema<DualOutputConvData> = {
    inputs: [
      {
        id: "in",
        type: "input",
        defaultLabel: "x",
        position: 0,
      },
    ],
    outputs: [
      {
        id: "conv_out",
        type: "output",
        defaultLabel: "conv_out",
        position: 0,
      },
      {
        id: "flat_out",
        type: "output",
        defaultLabel: "flat_out",
        position: 1,
      },
    ],
  };

  static shapeVerifier(data: DualOutputConvData, inputShapes: number[][]) {
    if (inputShapes.length === 0) {
      return { ok: false as const, error: "DualConv requires an input" };
    }
    const input = inputShapes[0];
    if (input.length !== 4) {
      return {
        ok: false as const,
        error: "DualConv expects 4D input [B, C, H, W]",
      };
    }
    return { ok: true as const };
  }

  // Return per-handle shapes
  static shapeCompute(
    data: DualOutputConvData,
    inputShapes: number[][],
  ): Record<string, number[]> {
    const [B, _C, H, W] = inputShapes[0];
    const out_channels =
      data.out_channels ?? this.paramSchema.out_channels.defaultValue;
    const kernel_size =
      data.kernel_size ?? this.paramSchema.kernel_size.defaultValue;

    // Simple conv shape (assuming stride=1, padding=0)
    const H_out = H - kernel_size + 1;
    const W_out = W - kernel_size + 1;

    const convShape = [B, out_channels, H_out, W_out];
    const flatShape = [B, out_channels * H_out * W_out];

    return {
      conv_out: convShape,
      flat_out: flatShape,
    };
  }

  static getInitCode(data: DualOutputConvData, name: string): string {
    const in_channels =
      data.in_channels ?? this.paramSchema.in_channels.defaultValue;
    const out_channels =
      data.out_channels ?? this.paramSchema.out_channels.defaultValue;
    const kernel_size =
      data.kernel_size ?? this.paramSchema.kernel_size.defaultValue;

    return `self.${name} = nn.Conv2d(in_channels=${in_channels}, out_channels=${out_channels}, kernel_size=${kernel_size})`;
  }

  static getForwardCode(
    data: DualOutputConvData,
    name: string,
    inputs: Array<string>,
    outputs: Array<string>,
  ): string {
    const input = inputs[0] || "x";
    const conv_out = outputs[0] || "conv_out";
    const flat_out = outputs[1] || "flat_out";

    return [
      `${conv_out} = self.${name}(${input})`,
      `${flat_out} = ${conv_out}.flatten(start_dim=1)`,
    ].join("\n        ");
  }

  static Component = createLayerComponent<DualOutputConvData>(
    DualOutputConvNode.label,
    DualOutputConvNode.paramSchema,
    {
      handles: {
        targets: ["in"],
        sources: ["conv_out", "flat_out"],
      },
    },
  );
}
