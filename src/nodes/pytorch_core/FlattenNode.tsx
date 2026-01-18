import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";


type FlattenData = Record<string, never>;

export class FlattenNode {
    static label = "Flatten";
    static paramSchema: Record<string, FieldSpec> = {};

    static shapeVerifier(_data: FlattenData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Flatten expects exactly one input" };
        const shape = inputShapes[0];
        if (!Array.isArray(shape) || shape.length === 0) return { ok: false as const, error: "Input shape must be defined" };
        if (shape.some(dim => dim <= 0 || Number.isNaN(dim))) {
            return { ok: false as const, error: "All dimensions must be > 0" };
        }
        return { ok: true as const };
    }

    static shapeCompute(_data: FlattenData, inputShapes: number[][]) {
        const shape = inputShapes[0] || [];
        if (shape.length === 0) return [];
        if (shape.length === 1) return [shape[0]];
        const [batch, ...rest] = shape;
        const flat = rest.reduce((acc, v) => acc * v, 1);
        return [batch, flat];
    }

    static estimateCost() {
        return { params: 0, flops: 0 };
    }

    static getInitCode(_data: FlattenData, name: string) {
        return `self.${name} = nn.Flatten()`;
    }

    static getForwardCode(_data: FlattenData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }
    static Component = createLayerComponent<FlattenData>(FlattenNode.label, FlattenNode.paramSchema);
}
