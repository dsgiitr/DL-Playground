import { createLayerComponent, type FieldSpec } from "./BaseClass";

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
    static computeShape(data: LinearData) {
        return [data.out_features];
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
    static Component = createLayerComponent<LinearData>(
        LinearLayerNode.label,
        LinearLayerNode.paramSchema,
        LinearLayerNode.computeShape
    );
}


