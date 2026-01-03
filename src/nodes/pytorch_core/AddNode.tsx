import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";
import { type HandleSchema } from "../../types/handleTypes";

type AddData = Record<string, never>;

export class AddNode {
  static label = "Add";
  static paramSchema: Record<string, FieldSpec> = {};

  static handleSchema: HandleSchema<AddData> = {
    inputs: [
      { id: "in-0", type: "input", defaultLabel: "a", position: 0 },
      { id: "in-1", type: "input", defaultLabel: "b", position: 1 },
    ],
    outputs: [{ id: "out", type: "output", defaultLabel: "sum", position: 0 }],
  };

  static shapeVerifier(_data: AddData, inputShapes: number[][]) {
    if (inputShapes.length < 2)
      return { ok: false as const, error: "Add expects at least two inputs" };
    const base = JSON.stringify(inputShapes[0]);
    for (let i = 1; i < inputShapes.length; i++) {
      if (JSON.stringify(inputShapes[i]) !== base) {
        return {
          ok: false as const,
          error: "All inputs to Add must have identical shapes",
        };
      }
    }
    return { ok: true as const };
  }

  static shapeCompute(_data: AddData, inputShapes: number[][]) {
    return inputShapes[0] ? [...inputShapes[0]] : [];
  }

  static getInitCode() {
    return "# add is functional";
  }

  static getForwardCode(
    _data: AddData,
    _name: string,
    inputs: Array<string>,
    outputs: Array<string>
  ) {
    const out = outputs[0] || "x";
    const args = inputs.filter(Boolean);
    if (!args.length) return "";
    const sumExpr = args.join(" + ");
    return `${out} = ${sumExpr}`;
  }

  static computeShape(_data: AddData) {
    return [];
  }

  static Component = createLayerComponent<AddData>(
    AddNode.label,
    AddNode.paramSchema,
    { handleSchema: AddNode.handleSchema }
  );
}
