import { type FieldSpec } from "../../node_gen/BaseClass";
import { estimateReductionCost } from "../../utils/computeUtils";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type LossData = Record<string, never>;

export class MSELossNode {
    static label = "MSELoss";
    static paramSchema: Record<string, FieldSpec> = {};
    static handles = { targets: ["pred", "target"], sources: ["out-0"] };

    static shapeVerifier(_data: LossData, inputShapes: number[][]) {
        if (inputShapes.length !== 2) return { ok: false as const, error: "MSELoss expects pred and target" };
        if (JSON.stringify(inputShapes[0]) !== JSON.stringify(inputShapes[1])) {
            return { ok: false as const, error: "Pred and target shapes must match" };
        }
        return { ok: true as const };
    }

    static shapeCompute(_data: LossData, _inputShapes: number[][]) {
        return []; // scalar loss
    }

    static estimateCost(_data: LossData, inputShapes: number[][]) {
        const predShape = inputShapes[0] || [];
        return estimateReductionCost(predShape, 2);
    }

    static getInitCode(_data: LossData, name: string) {
        return `self.${name} = nn.MSELoss()`;
    }

    static getForwardCode(_data: LossData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const pred = inputs[0] || "pred";
        const target = inputs[1] || "target";
        const out = outputs[0] || "loss";
        return `${out} = self.${name}(${pred}, ${target})`;
    }

    static Component = createLayerComponent<LossData>(MSELossNode.label, MSELossNode.paramSchema, {
        handles: { targets: ["pred", "target"], sources: ["out-0"] }
    });
}
