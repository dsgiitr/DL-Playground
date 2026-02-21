import { getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
import { estimateReductionCost } from "../../utils/computeUtils";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type ReduceData = { dim?: number };

function reduceShape(shape: number[], dim: number) {
    const rank = shape.length;
    const axis = dim < 0 ? rank + dim : dim;
    if (axis < 0 || axis >= rank) return null;
    const next = [...shape];
    next.splice(axis, 1);
    return next.length ? next : [1];
}

export function makeReduction(label: string, torchFn: string) {
    return class ReductionNode {
        static label = label;
        static paramSchema: Record<string, FieldSpec> = {
            dim: { required: true, type: "number", label: "Dim (default last)", defaultValue: -1, step: 1 }
        };
        static handles = { targets: ["in-0"], sources: ["out-0"] };

        static shapeVerifier(data: ReduceData, inputShapes: number[][]) {
            if (inputShapes.length !== 1) return { ok: false as const, error: `${label} expects one input` };
            const shape = inputShapes[0];
            if (!Array.isArray(shape) || !shape.length) return { ok: false as const, error: "Input shape must be defined" };
            const dim = getParamValue(this, data, "dim") as number;
            const rank = shape.length;
            const axis = dim < 0 ? rank + dim : dim;
            if (axis < 0 || axis >= rank) return { ok: false as const, error: `Dim must be in [0, ${rank - 1}]` };
            return { ok: true as const };
        }

        static shapeCompute(data: ReduceData, inputShapes: number[][]) {
            const shape = inputShapes[0] || [];
            const dim = getParamValue(this, data, "dim") as number;
            return reduceShape(shape, dim) || [];
        }

        static estimateCost(_data: ReduceData, inputShapes: number[][]) {
            const inputShape = inputShapes[0] || [];
            return estimateReductionCost(inputShape);
        }

        static getInitCode() {
            return `# ${label} uses torch.${torchFn}`;
        }

        static getForwardCode(data: ReduceData, _name: string, inputs: Array<string>, outputs: Array<string>) {
            const out = outputs[0] || "x";
            const inputVar = inputs[0] || "x";
            const dim = getParamValue(this, data, "dim");
            return `${out} = torch.${torchFn}(${inputVar}, dim=${dim})`;
        }

        static Component = createLayerComponent<ReduceData>(label, ReductionNode.paramSchema);
    };
}
