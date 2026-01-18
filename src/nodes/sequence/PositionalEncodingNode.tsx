import { getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
import { estimateElementwiseCost } from "../../utils/computeUtils";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type PosEncData = { dim: number };

// Sinusoidal positional encoding computed on the fly (no buffer size limits).
export class PositionalEncodingNode {
    static label = "PositionalEncoding";
    static paramSchema: Record<string, FieldSpec> = {
        dim: { required: true, type: "number", label: "Embed Dim", defaultValue: 128, step: 1 }
    };

    static shapeVerifier(data: PosEncData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "PositionalEncoding expects one input" };
        const shape = inputShapes[0];
        if (shape.length !== 3) return { ok: false as const, error: "Input must be [batch, seq, dim]" };
        const dim = getParamValue(this, data, "dim") as number;
        if (shape[2] !== dim) return { ok: false as const, error: `Expected embed dim ${dim}, got ${shape[2]}` };
        return { ok: true as const };
    }

    static shapeCompute(_data: PosEncData, inputShapes: number[][]) {
        return [...(inputShapes[0] || [])];
    }

    static estimateCost(_data: PosEncData, _inputShapes: number[][], outputShape: number[]) {
        return estimateElementwiseCost(outputShape, 1);
    }

    static getInitCode() {
        return "# positional encoding computed in forward (sinusoidal)";
    }

    static getForwardCode(data: PosEncData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const x = inputs[0] || "x";
        const out = outputs[0] || "x";
        const dim = getParamValue(PositionalEncodingNode.paramSchema, data, "dim");
        return [
            "seq_len = " + x + ".shape[1]",
            "position = torch.arange(seq_len, device=" + x + ".device).unsqueeze(1)",
            "div_term = torch.exp(torch.arange(0, " + dim + ", 2, device=" + x + ".device) * (-torch.log(torch.tensor(10000.0, device=" + x + ".device)) / " + dim + "))",
            "pe = torch.zeros(1, seq_len, " + dim + ", device=" + x + ".device)",
            "pe[0, :, 0::2] = torch.sin(position * div_term)",
            "pe[0, :, 1::2] = torch.cos(position * div_term)",
            out + " = " + x + " + pe"
        ].join("\\n        ");
    }

    static Component = createLayerComponent<PosEncData>(PositionalEncodingNode.label, PositionalEncodingNode.paramSchema);
}
