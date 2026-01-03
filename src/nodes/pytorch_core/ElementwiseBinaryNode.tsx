import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";
import { type HandleSchema } from "../../types/handleTypes";

type BinaryData = Record<string, never>;

export function makeElementwiseBinary(label: string, op: string) {
  return class ElementwiseBinaryNode {
    static label = label;
    static paramSchema: Record<string, FieldSpec> = {};

    static handleSchema: HandleSchema<BinaryData> = {
      inputs: [
        { id: "in-0", type: "input", defaultLabel: "a", position: 0 },
        { id: "in-1", type: "input", defaultLabel: "b", position: 1 },
      ],
      outputs: [
        { id: "out", type: "output", defaultLabel: "result", position: 0 },
      ],
    };

    static shapeVerifier(_data: BinaryData, inputShapes: number[][]) {
      if (inputShapes.length < 2)
        return {
          ok: false as const,
          error: `${label} expects at least two inputs`,
        };
      const base = JSON.stringify(inputShapes[0]);
      for (let i = 1; i < inputShapes.length; i++) {
        if (JSON.stringify(inputShapes[i]) !== base) {
          return {
            ok: false as const,
            error: `${label} requires identical input shapes`,
          };
        }
      }
      return { ok: true as const };
    }

    static shapeCompute(_data: BinaryData, inputShapes: number[][]) {
      return [...(inputShapes[0] || [])];
    }

    static getInitCode() {
      return `# ${label} uses functional op`;
    }

    static getForwardCode(
      _data: BinaryData,
      _name: string,
      inputs: Array<string>,
      outputs: Array<string>
    ) {
      const out = outputs[0] || "x";
      const args = inputs.filter(Boolean);
      if (args.length < 2) return `${out} = ${args[0] || "x"}`;
      return `${out} = ${args.join(` ${op} `)}`;
    }

    static Component = createLayerComponent<BinaryData>(
      label,
      ElementwiseBinaryNode.paramSchema,
      { handleSchema: ElementwiseBinaryNode.handleSchema }
    );
  };
}
