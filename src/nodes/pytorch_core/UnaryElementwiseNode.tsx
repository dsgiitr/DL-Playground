import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";
import { type HandleSchema } from "../../types/handleTypes";

type UnaryData = Record<string, never>;

export function makeUnaryElementwise(
  label: string,
  expr: (input: string) => string
) {
  return class UnaryElementwiseNode {
    static label = label;
    static paramSchema: Record<string, FieldSpec> = {};

    static handleSchema: HandleSchema<UnaryData> = {
      inputs: [{ id: "in", type: "input", defaultLabel: "x", position: 0 }],
      outputs: [
        { id: "out", type: "output", defaultLabel: "result", position: 0 },
      ],
    };

    static shapeVerifier(_data: UnaryData, inputShapes: number[][]) {
      if (inputShapes.length !== 1)
        return { ok: false as const, error: `${label} expects one input` };
      const shape = inputShapes[0];
      if (!Array.isArray(shape) || !shape.length)
        return { ok: false as const, error: "Input shape must be defined" };
      return { ok: true as const };
    }

    static shapeCompute(_data: UnaryData, inputShapes: number[][]) {
      return [...(inputShapes[0] || [])];
    }

    static getInitCode() {
      return `# ${label} uses functional torch op`;
    }

    static getForwardCode(
      _data: UnaryData,
      _name: string,
      inputs: Array<string>,
      outputs: Array<string>
    ) {
      const out = outputs[0] || "x";
      const inputVar = inputs[0] || "x";
      return `${out} = ${expr(inputVar)}`;
    }

    static Component = createLayerComponent<UnaryData>(
      label,
      UnaryElementwiseNode.paramSchema,
      {
        handleSchema: UnaryElementwiseNode.handleSchema,
      }
    );
  };
}
