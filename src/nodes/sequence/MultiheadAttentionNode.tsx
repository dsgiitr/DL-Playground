import { getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";
import { type HandleSchema } from "../../types/handleTypes";

type MhaData = {
  embed_dim: number;
  num_heads: number;
};

export class MultiheadAttentionNode {
  static label = "MultiheadAttention";
  static paramSchema: Record<string, FieldSpec> = {
    embed_dim: {
      required: true,
      type: "number",
      label: "Embed Dim",
      defaultValue: 128,
      step: 1,
    },
    num_heads: {
      required: true,
      type: "number",
      label: "Heads",
      defaultValue: 8,
      step: 1,
    },
  };

  static handleSchema: HandleSchema<MhaData> = {
    inputs: [
      { id: "query", type: "input", defaultLabel: "query", position: 0 },
      { id: "key", type: "input", defaultLabel: "key", position: 1 },
      { id: "value", type: "input", defaultLabel: "value", position: 2 },
      { id: "mask", type: "input", defaultLabel: "mask", position: 3 },
    ],
    outputs: [
      { id: "out", type: "output", defaultLabel: "attn_out", position: 0 },
    ],
  };

  static shapeVerifier(data: MhaData, inputShapes: number[][]) {
    if (inputShapes.length < 1 || inputShapes.length > 4)
      return { ok: false as const, error: "Expect 1-4 inputs (q[,k,v,mask])" };
    const q = inputShapes[0];
    if (q.length !== 3)
      return { ok: false as const, error: "Query must be [batch, seq, dim]" };
    const embed = getParamValue(this, data, "embed_dim") as number;
    const heads = getParamValue(this, data, "num_heads") as number;
    if (q[2] !== embed)
      return {
        ok: false as const,
        error: `Expected embed_dim ${embed}, got ${q[2]}`,
      };
    if (heads <= 0 || embed % heads !== 0)
      return {
        ok: false as const,
        error: "embed_dim must be divisible by num_heads",
      };
    const kShape = inputShapes[1] || q;
    const vShape = inputShapes[2] || q;
    if (JSON.stringify(kShape) !== JSON.stringify(q))
      return { ok: false as const, error: "Key must match query shape" };
    if (JSON.stringify(vShape) !== JSON.stringify(q))
      return { ok: false as const, error: "Value must match query shape" };
    const mask = inputShapes[3];
    if (mask) {
      if (mask.length === 3) {
        const [b, t, s] = mask;
        if (b !== q[0] || t !== q[1] || s !== kShape[1])
          return {
            ok: false as const,
            error: "Mask must be [batch, tgt_seq, src_seq]",
          };
      } else if (mask.length === 2) {
        const [t, s] = mask;
        if (t !== q[1] || s !== kShape[1])
          return { ok: false as const, error: "Mask must match seq lengths" };
      } else {
        return { ok: false as const, error: "Mask must be 2D or 3D" };
      }
    }
    return { ok: true as const };
  }

  static shapeCompute(data: MhaData, inputShapes: number[][]) {
    const [b, t] = inputShapes[0];
    const embed = getParamValue(this, data, "embed_dim") as number;
    return [b, t, embed];
  }

  static getInitCode(data: MhaData, name: string) {
    const embed = getParamValue(
      MultiheadAttentionNode.paramSchema,
      data,
      "embed_dim"
    );
    const heads = getParamValue(
      MultiheadAttentionNode.paramSchema,
      data,
      "num_heads"
    );
    return `self.${name} = nn.MultiheadAttention(${embed}, ${heads}, batch_first=True)`;
  }

  static getForwardCode(
    _data: MhaData,
    name: string,
    inputs: Array<string>,
    outputs: Array<string>
  ) {
    const q = inputs[0] || "x";
    const k = inputs[1] || q;
    const v = inputs[2] || q;
    const mask = inputs[3];
    const out = outputs[0] || "x";
    const maskArg = mask ? `, attn_mask=${mask}` : "";
    return `${out}, _ = self.${name}(${q}, ${k}, ${v}${maskArg})`;
  }

  static Component = createLayerComponent<MhaData>(
    MultiheadAttentionNode.label,
    MultiheadAttentionNode.paramSchema,
    {
      handleSchema: MultiheadAttentionNode.handleSchema,
    }
  );
}
