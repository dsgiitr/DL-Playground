import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";
import { type HandleSchema } from "../../types/handleTypes";

type UnaryData = Record<string, never>;

// Factory to build simple activation nodes with identical shape.
export function makeUnaryActivation(
  label: string,
  initExpr: string,
  forwardExpr: (input: string) => string
) {
  return class UnaryActivationNode {
    static label = label;
    static paramSchema: Record<string, FieldSpec> = {};

    static handleSchema: HandleSchema<UnaryData> = {
      inputs: [{ id: "in", type: "input", defaultLabel: "x", position: 0 }],
      outputs: [
        { id: "out", type: "output", defaultLabel: "out", position: 0 },
      ],
    };

    static shapeVerifier(_data: UnaryData, inputShapes: number[][]) {
      if (inputShapes.length !== 1)
        return {
          ok: false as const,
          error: `${label} expects exactly one input`,
        };
      const shape = inputShapes[0];
      if (!Array.isArray(shape) || !shape.length)
        return { ok: false as const, error: "Input shape must be defined" };
      return { ok: true as const };
    }

    static shapeCompute(_data: UnaryData, inputShapes: number[][]) {
      return [...(inputShapes[0] || [])];
    }

    static getInitCode(_data: UnaryData, name: string) {
      return `self.${name} = ${initExpr}`;
    }

    static getForwardCode(
      _data: UnaryData,
      name: string,
      inputs: Array<string>,
      outputs: Array<string>
    ) {
      const inputVar = inputs[0] || "x";
      const outputVar = outputs[0] || "x";
      return `${outputVar} = ${forwardExpr(`self.${name}(${inputVar})`)}`;
    }

    static Component = createLayerComponent<UnaryData>(
      label,
      UnaryActivationNode.paramSchema,
      {
        handleSchema: UnaryActivationNode.handleSchema,
      }
    );
  };
}
