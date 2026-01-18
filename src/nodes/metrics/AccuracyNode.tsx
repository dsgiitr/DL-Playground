import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type MetricData = Record<string, never>;

export class AccuracyNode {
    static label = "Accuracy";
    static paramSchema: Record<string, FieldSpec> = {};
    static handles = { targets: ["logits", "target"], sources: ["out-0"] };

    static shapeVerifier(_data: MetricData, inputShapes: number[][]) {
        if (inputShapes.length !== 2) return { ok: false as const, error: "Accuracy expects logits and target" };
        const logits = inputShapes[0];
        const target = inputShapes[1];
        if (logits.length !== 2 && logits.length !== 3) return { ok: false as const, error: "Logits must be [batch, classes] or [batch, seq, classes]" };
        if (logits[0] !== target[0]) return { ok: false as const, error: "Batch size mismatch" };
        return { ok: true as const };
    }

    static shapeCompute(_data: MetricData, _inputShapes: number[][]) {
        return []; // scalar metric
    }

    static estimateCost() {
        return { params: 0, flops: 0 };
    }

    static getInitCode() {
        return "# accuracy is computed in forward";
    }

    static getForwardCode(_data: MetricData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const logits = inputs[0] || "logits";
        const target = inputs[1] || "target";
        const out = outputs[0] || "acc";
        return `${out} = (torch.argmax(${logits}, dim=-1) == ${target}).float().mean()`;
    }

    static Component = createLayerComponent<MetricData>(AccuracyNode.label, AccuracyNode.paramSchema, {
        handles: { targets: ["logits", "target"], sources: ["out-0"] }
    });
}
