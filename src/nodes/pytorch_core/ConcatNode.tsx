import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";
import { type HandleSchema } from "../../types/handleTypes";

type ConcatData = {
  dim?: number;
};

export class ConcatNode {
  static label = "Concat";
  static paramSchema: Record<string, FieldSpec> = {
    dim: {
      required: true,
      type: "number",
      label: "Axis",
      defaultValue: 1,
      step: 1,
    },
  };

  static handleSchema: HandleSchema<ConcatData> = {
    inputs: [
      { id: "in-0", type: "input", defaultLabel: "x1", position: 0 },
      { id: "in-1", type: "input", defaultLabel: "x2", position: 1 },
    ],
    outputs: [
      { id: "out", type: "output", defaultLabel: "concat", position: 0 },
    ],
  };

  static shapeVerifier(data: ConcatData, inputShapes: number[][]) {
    if (inputShapes.length < 2)
      return { ok: false as const, error: "Concat needs at least two inputs" };
    const rank = inputShapes[0].length;
    const dim = (data.dim ?? this.paramSchema.dim.defaultValue) as number;
    if (dim < 0 || dim >= rank)
      return {
        ok: false as const,
        error: `Axis must be between 0 and ${rank - 1}`,
      };

    for (let i = 1; i < inputShapes.length; i++) {
      const shp = inputShapes[i];
      if (shp.length !== rank)
        return {
          ok: false as const,
          error: "All inputs must have the same rank",
        };
      for (let d = 0; d < rank; d++) {
        if (d === dim) continue;
        if (shp[d] !== inputShapes[0][d]) {
          return {
            ok: false as const,
            error:
              "Concat requires matching dims on all axes except concat axis",
          };
        }
      }
    }
    return { ok: true as const };
  }

  static shapeCompute(data: ConcatData, inputShapes: number[][]) {
    const dim = (data.dim ?? this.paramSchema.dim.defaultValue) as number;
    const base = [...inputShapes[0]];
    const sum = inputShapes.reduce((acc, shp) => acc + shp[dim], 0);
    base[dim] = sum;
    return base;
  }

  static getInitCode() {
    return "# concat has no module; handled in forward";
  }

  static getForwardCode(
    _data: ConcatData,
    _name: string,
    inputs: Array<string>,
    outputs: Array<string>
  ) {
    const out = outputs[0] || "x";
    const args = inputs.filter(Boolean).join(", ");
    const dim = _data.dim ?? this.paramSchema.dim.defaultValue;
    return `${out} = torch.cat([${args}], dim=${dim})`;
  }

  static computeShape(_data: ConcatData) {
    return [];
  }

  static Component = createLayerComponent<ConcatData>(
    ConcatNode.label,
    ConcatNode.paramSchema,
    { handleSchema: ConcatNode.handleSchema }
  );
}
