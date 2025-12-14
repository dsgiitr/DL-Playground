import { getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type SoftmaxData = { dim?: number };

export class SoftmaxNode {
    static label = "Softmax";
    static paramSchema: Record<string, FieldSpec> = {
        dim: { required: true, type: "number", label: "Dim", defaultValue: -1, step: 1 }
    };
    static handles = { targets: ["in-0"], sources: ["out-0"] };

    static shapeVerifier(data: SoftmaxData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Softmax expects one input" };
        const shape = inputShapes[0];
        if (!Array.isArray(shape) || !shape.length) return { ok: false as const, error: "Input shape must be defined" };
        const dim = getParamValue(this, data, "dim") as number;
        const rank = shape.length;
        const axis = dim < 0 ? rank + dim : dim;
        if (axis < 0 || axis >= rank) return { ok: false as const, error: `Dim must be in [0, ${rank - 1}]` };
        return { ok: true as const };
    }

    static shapeCompute(_data: SoftmaxData, inputShapes: number[][]) {
        return [...(inputShapes[0] || [])];
    }

    static getInitCode(data: SoftmaxData, name: string) {
        const dim = getParamValue(SoftmaxNode.paramSchema, data, "dim");
        return `self.${name} = nn.Softmax(dim=${dim})`;
    }

    static getForwardCode(_data: SoftmaxData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<SoftmaxData>(SoftmaxNode.label, SoftmaxNode.paramSchema);
}

export class LogSoftmaxNode {
    static label = "LogSoftmax";
    static paramSchema: Record<string, FieldSpec> = SoftmaxNode.paramSchema;
    static handles = { targets: ["in-0"], sources: ["out-0"] };

    static shapeVerifier = SoftmaxNode.shapeVerifier;
    static shapeCompute = SoftmaxNode.shapeCompute;
    static getInitCode(data: SoftmaxData, name: string) {
        const dim = getParamValue(SoftmaxNode.paramSchema, data, "dim");
        return `self.${name} = nn.LogSoftmax(dim=${dim})`;
    }
    static getForwardCode(_data: SoftmaxData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }
    static Component = createLayerComponent<SoftmaxData>(LogSoftmaxNode.label, LogSoftmaxNode.paramSchema);
}
