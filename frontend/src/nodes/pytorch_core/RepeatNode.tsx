import { type FieldSpec } from "../../node_gen/BaseClass";
import { estimateElementwiseCost } from "../../utils/computeUtils";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type RepeatData = { repeats: string };

function parseRepeats(raw: string): number[] | null {
    const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    const nums: number[] = [];
    for (const p of parts) {
        const n = Number(p);
        if (!Number.isInteger(n) || n <= 0) return null;
        nums.push(n);
    }
    return nums;
}

export class RepeatNode {
    static label = "Repeat";
    static paramSchema: Record<string, FieldSpec> = {
        repeats: { required: true, type: "text", label: "Repeats (comma)", defaultValue: "1,1" }
    };

    static shapeVerifier(data: RepeatData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Repeat expects one input" };
        const shape = inputShapes[0];
        if (!Array.isArray(shape) || !shape.length) return { ok: false as const, error: "Input shape must be defined" };
        const reps = parseRepeats(data.repeats || "");
        if (!reps) return { ok: false as const, error: "Repeats must be positive integers" };
        if (reps.length !== shape.length) return { ok: false as const, error: "Repeats length must match rank" };
        return { ok: true as const };
    }

    static shapeCompute(data: RepeatData, inputShapes: number[][]) {
        const shape = inputShapes[0] || [];
        const reps = parseRepeats(data.repeats || "") || [];
        return shape.map((dim, idx) => dim * reps[idx]);
    }

    static estimateCost(_data: RepeatData, _inputShapes: number[][], outputShape: number[]) {
        return estimateElementwiseCost(outputShape);
    }

    static getInitCode() {
        return "# repeat handled in forward";
    }

    static getForwardCode(data: RepeatData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const out = outputs[0] || "x";
        const inputVar = inputs[0] || "x";
        const reps = data.repeats || "";
        return `${out} = ${inputVar}.repeat(${reps})`;
    }

    static Component = createLayerComponent<RepeatData>(RepeatNode.label, RepeatNode.paramSchema);
}
