import { type FieldSpec } from "../../node_gen/BaseClass";
import { estimateElementwiseCost } from "../../utils/computeUtils";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type BinaryData = Record<string, never>;

export function makeElementwiseBinary(label: string, op: string) {
    return class ElementwiseBinaryNode {
        static label = label;
        static paramSchema: Record<string, FieldSpec> = {};
        static handles = { targets: ["in-0", "in-1"], sources: ["out-0"] };

        static shapeVerifier(_data: BinaryData, inputShapes: number[][]) {
            if (inputShapes.length < 2) return { ok: false as const, error: `${label} expects at least two inputs` };
            const base = JSON.stringify(inputShapes[0]);
            for (let i = 1; i < inputShapes.length; i++) {
                if (JSON.stringify(inputShapes[i]) !== base) {
                    return { ok: false as const, error: `${label} requires identical input shapes` };
                }
            }
            return { ok: true as const };
        }

        static shapeCompute(_data: BinaryData, inputShapes: number[][]) {
            return [...(inputShapes[0] || [])];
        }

        static estimateCost(_data: BinaryData, _inputShapes: number[][], outputShape: number[]) {
            return estimateElementwiseCost(outputShape);
        }

        static getInitCode() {
            return `# ${label} uses functional op`;
        }

        static getForwardCode(_data: BinaryData, _name: string, inputs: Array<string>, outputs: Array<string>) {
            const out = outputs[0] || "x";
            const args = inputs.filter(Boolean);
            if (args.length < 2) return `${out} = ${args[0] || "x"}`;
            return `${out} = ${args.join(` ${op} `)}`;
        }

        static Component = createLayerComponent<BinaryData>(label, ElementwiseBinaryNode.paramSchema, { targetHandles: 2 });
    };
}
