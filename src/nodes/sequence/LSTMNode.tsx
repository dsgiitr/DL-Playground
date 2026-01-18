import { getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
import { estimateRecurrentCost } from "../../utils/computeUtils";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type LstmData = {
    input_size: number;
    hidden_size: number;
    num_layers?: number;
    bidirectional?: boolean;
};

export class LSTMNode {
    static label = "LSTM";
    static paramSchema: Record<string, FieldSpec> = {
        input_size: { required: true, type: "number", label: "Input Size", defaultValue: 128, step: 1 },
        hidden_size: { required: true, type: "number", label: "Hidden Size", defaultValue: 128, step: 1 },
        num_layers: { required: false, type: "number", label: "Layers", defaultValue: 1, step: 1 },
        bidirectional: { required: false, type: "boolean", label: "Bidirectional", defaultValue: false }
    };
    static handles = { targets: ["in-0"], sources: ["out-0"] };

    static shapeVerifier(data: LstmData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "LSTM expects one input" };
        const shape = inputShapes[0];
        if (shape.length !== 3) return { ok: false as const, error: "Input must be [batch, seq, feature]" };
        const feature = shape[2];
        const inputSize = getParamValue(this, data, "input_size") as number;
        if (feature !== inputSize) return { ok: false as const, error: `Expected feature dim ${inputSize}, got ${feature}` };
        return { ok: true as const };
    }

    static shapeCompute(data: LstmData, inputShapes: number[][]) {
        const [b, t] = inputShapes[0];
        const h = getParamValue(this, data, "hidden_size") as number;
        const bidir = getParamValue(this, data, "bidirectional") ? 2 : 1;
        return [b, t, h * bidir];
    }

    static estimateCost(data: LstmData, inputShapes: number[][]) {
        const input = inputShapes[0] || [];
        const inputSize = getParamValue(this, data, "input_size") as number;
        const hiddenSize = getParamValue(this, data, "hidden_size") as number;
        const layers = getParamValue(this, data, "num_layers") as number;
        const bidir = !!getParamValue(this, data, "bidirectional");
        return estimateRecurrentCost(input, inputSize, hiddenSize, layers || 1, bidir, 4);
    }

    static getInitCode(data: LstmData, name: string) {
        const inputSize = getParamValue(LSTMNode.paramSchema, data, "input_size");
        const hiddenSize = getParamValue(LSTMNode.paramSchema, data, "hidden_size");
        const layers = getParamValue(LSTMNode.paramSchema, data, "num_layers");
        const bidir = getParamValue(LSTMNode.paramSchema, data, "bidirectional");
        return `self.${name} = nn.LSTM(${inputSize}, ${hiddenSize}, num_layers=${layers}, bidirectional=${bidir ? "True" : "False"}, batch_first=True)`;
    }

    static getForwardCode(_data: LstmData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar}, _ = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<LstmData>(LSTMNode.label, LSTMNode.paramSchema);
}
