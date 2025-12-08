import { createLayerComponent, getParamValue, type FieldSpec } from "../node_gen/BaseClass";

type LinearData = {
    in_features: number;
    out_features: number;
    bias?: boolean
};

export class LinearLayerNode {
    static label = "Linear Layer";
    static paramSchema: Record<string, FieldSpec> = {
        in_features: {
            required: true,
            type: 'number',
            label: 'In Features',
            defaultValue: 1,
            step: 1
        },
        out_features: {
            required: true,
            type: 'number',
            label: 'Out Features',
            defaultValue: 1,
            step: 1
        },
        bias: {
            required: false,
            type: 'boolean',
            label: 'Bias',
            defaultValue: true
        }
    }
    static shapeVerifier(data: LinearData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Linear expects exactly one input" };
        const shape = inputShapes[0];
        if (shape.length !== 1 && shape.length !== 2) return { ok: false as const, error: "Linear input must be [features] or [batch, features]" };

        const inFeatures = getParamValue(this, data, "in_features") as number;
        const outFeatures = getParamValue(this, data, "out_features") as number;
        if (inFeatures <= 0 || outFeatures <= 0) return { ok: false as const, error: "in_features and out_features must be > 0" };

        const featureDim = shape[shape.length - 1];
        if (featureDim !== inFeatures) {
            return { ok: false as const, error: `Expected ${inFeatures} input features, got ${featureDim}` };
        }
        return { ok: true as const };
    }
    static shapeCompute(data: LinearData, inputShapes: number[][]) {
        const shape = inputShapes[0] || [];
        const outFeatures = getParamValue(this, data, "out_features") as number;
        if (shape.length === 2) return [shape[0], outFeatures];
        return [outFeatures];
    }
    static getInitCode(data: LinearData, name: string) {
        const i = data.in_features || this.paramSchema.in_features.defaultValue;
        const o = data.out_features || this.paramSchema.out_features.defaultValue;
        const biasStr = data.bias === false ? ', bias=False' : '';
        return `self.${name} = nn.Linear(${i}, ${o}${biasStr})`;
    }
    static getForwardCode(data: LinearData, name: string, inputs: Array<string>, outputs: Array<string>) {
        data = data;
        name = name;
        inputs = inputs;
        outputs = outputs;
        return ``;
    }
    static Component = createLayerComponent<LinearData>(LinearLayerNode.label, LinearLayerNode.paramSchema);
}
