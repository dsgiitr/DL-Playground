import { type FieldSpec } from "../../node_gen/BaseClass";
import { estimateReductionCost } from "../../utils/computeUtils";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type LossData = Record<string, never>;

export class CrossEntropyLossNode {
    static label = "CrossEntropyLoss";
    static paramSchema: Record<string, FieldSpec> = {};
    static handles = { targets: ["logits", "target"], sources: ["out-0"] };

    static shapeVerifier(_data: LossData, inputShapes: number[][]) {
        if (inputShapes.length !== 2) return { ok: false as const, error: "CrossEntropy expects logits and target" };
        const logits = inputShapes[0];
        const target = inputShapes[1];
        if (logits.length !== 2 && logits.length !== 3) return { ok: false as const, error: "Logits must be [batch, classes] or [batch, seq, classes]" };
        const batch = logits[0];
        if (target[0] !== batch) return { ok: false as const, error: "Target batch must match logits batch" };
        return { ok: true as const };
    }

    static shapeCompute(_data: LossData, _inputShapes: number[][]) {
        return [];
    }

    static estimateCost(_data: LossData, inputShapes: number[][]) {
        const logits = inputShapes[0] || [];
        return estimateReductionCost(logits, 5);
    }

    static getInitCode(_data: LossData, name: string) {
        return `self.${name} = nn.CrossEntropyLoss()`;
    }

    static getForwardCode(_data: LossData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const logits = inputs[0] || "logits";
        const target = inputs[1] || "target";
        const out = outputs[0] || "loss";
        return `${out} = self.${name}(${logits}, ${target})`;
    }

    static Component = createLayerComponent<LossData>(CrossEntropyLossNode.label, CrossEntropyLossNode.paramSchema, {
        handles: { targets: ["logits", "target"], sources: ["out-0"] }
    });
}
