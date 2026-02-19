import type { FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

// This layer is for demonstration and debugging purposes
type PassData = Record<string, never>;

export class PassLayerNode {
    static label = "Pass";
    static paramSchema: Record<string, FieldSpec> = {};

    static shapeVerifier(_data: PassData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) {
            return { ok: false as const, error: "Pass layer expects exactly one input" };
        }
        return { ok: true as const };
    }

    static shapeCompute(_data: PassData, inputShapes: number[][]) {
        return inputShapes[0] || [];
    }

    static estimateCost(_data: PassData, _inputShapes: number[][], _outputShape: number[]) {
        return { params: 0, flops: 0 };
    }

    static getInitCode(_data: PassData, name: string) {
        return `self.${name} = nn.Identity()`;
    }

    static getForwardCode(_data: PassData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs.length > 0 ? inputs[0] : "x";
        const outputVar = outputs.length > 0 ? outputs[0] : "x";
        return `${outputVar} = ${inputVar}`;
    }

    static Component = createLayerComponent<PassData>(PassLayerNode.label, PassLayerNode.paramSchema);
}