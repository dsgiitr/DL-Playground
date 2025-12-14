import { getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type EmbeddingData = {
    num_embeddings: number;
    embedding_dim: number;
    padding_idx?: number;
};

export class EmbeddingNode {
    static label = "Embedding";
    static paramSchema: Record<string, FieldSpec> = {
        num_embeddings: { required: true, type: "number", label: "Vocab Size", defaultValue: 1000, step: 1 },
        embedding_dim: { required: true, type: "number", label: "Dim", defaultValue: 128, step: 1 },
        padding_idx: { required: false, type: "number", label: "Padding Idx", defaultValue: -1, step: 1 }
    };

    static handles = { targets: ["in-0"], sources: ["out-0"] };

    static shapeVerifier(data: EmbeddingData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Embedding expects one input" };
        const shape = inputShapes[0];
        if (shape.length !== 2) return { ok: false as const, error: "Input must be [batch, seq]" };
        const vocab = getParamValue(this, data, "num_embeddings") as number;
        if (vocab <= 0) return { ok: false as const, error: "Vocab size must be > 0" };
        return { ok: true as const };
    }

    static shapeCompute(data: EmbeddingData, inputShapes: number[][]) {
        const [b, t] = inputShapes[0];
        const dim = getParamValue(this, data, "embedding_dim") as number;
        return [b, t, dim];
    }

    static getInitCode(data: EmbeddingData, name: string) {
        const vocab = getParamValue(EmbeddingNode.paramSchema, data, "num_embeddings");
        const dim = getParamValue(EmbeddingNode.paramSchema, data, "embedding_dim");
        const pad = getParamValue(EmbeddingNode.paramSchema, data, "padding_idx");
        const padArg = pad !== undefined && pad >= 0 ? `, padding_idx=${pad}` : "";
        return `self.${name} = nn.Embedding(${vocab}, ${dim}${padArg})`;
    }

    static getForwardCode(_data: EmbeddingData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<EmbeddingData>(EmbeddingNode.label, EmbeddingNode.paramSchema);
}
