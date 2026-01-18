import { buildInitString, getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
import { estimateElementwiseCost } from "../../utils/computeUtils";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type DropData = { p?: number };

export class DropoutNode {
    static label = "Dropout";
    static paramSchema: Record<string, FieldSpec> = {
        p: { required: false, type: "number", label: "p", defaultValue: 0.5 }
    };

    static shapeVerifier(data: DropoutNode, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Dropout expects one input" };
        const p = getParamValue(this, data as any, "p") as number;
        if (p < 0 || p > 1) return { ok: false as const, error: "p must be in [0,1]" };
        return { ok: true as const };
    }

    static shapeCompute(_data: DropoutNode, inputShapes: number[][]) {
        return [...(inputShapes[0] || [])];
    }

    static estimateCost(_data: DropoutNode, _inputShapes: number[][], outputShape: number[]) {
        return estimateElementwiseCost(outputShape);
    }
    static getInitCode(data: DropoutNode, name: string) {
        return buildInitString("nn.Dropout", name, DropoutNode.paramSchema, data as any);
    }

    static getForwardCode(_data: DropoutNode, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<any>(DropoutNode.label, DropoutNode.paramSchema);
}

export class SpatialDropout2dNode {
    static label = "SpatialDropout2d";
    static paramSchema: Record<string, FieldSpec> = DropoutNode.paramSchema;

    static shapeVerifier(data: DropoutNode, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "SpatialDropout2d expects one input" };
        const shape = inputShapes[0];
        if (shape.length !== 4) return { ok: false as const, error: "Input must be [N,C,H,W]" };
        return DropoutNode.shapeVerifier(data, inputShapes);
    }

    static shapeCompute = DropoutNode.shapeCompute;
    static estimateCost = DropoutNode.estimateCost;

    static getInitCode(data: DropoutNode, name: string) {
        return buildInitString("nn.Dropout2d", name, SpatialDropout2dNode.paramSchema, data as any);
    }
    static getForwardCode = DropoutNode.getForwardCode;
    static Component = createLayerComponent<any>(SpatialDropout2dNode.label, SpatialDropout2dNode.paramSchema);
}

export class AlphaDropoutNode {
    static label = "AlphaDropout";
    static paramSchema: Record<string, FieldSpec> = DropoutNode.paramSchema;

    static shapeVerifier = DropoutNode.shapeVerifier;
    static shapeCompute = DropoutNode.shapeCompute;
    static estimateCost = DropoutNode.estimateCost;
    static getInitCode(data: DropoutNode, name: string) {
        return buildInitString("nn.AlphaDropout", name, AlphaDropoutNode.paramSchema, data as any);
    }
    static getForwardCode = DropoutNode.getForwardCode;
    static Component = createLayerComponent<any>(AlphaDropoutNode.label, AlphaDropoutNode.paramSchema);
}

export class StochasticDepthNode {
    static label = "StochasticDepth";
    static paramSchema: Record<string, FieldSpec> = {
        p: { required: true, type: "number", label: "Drop prob", defaultValue: 0.1 }
    };
    static handles = { targets: ["in-0"], sources: ["out-0"] };

    static shapeVerifier(data: DropData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "StochasticDepth expects one input" };
        const p = getParamValue(this, data as any, "p") as number;
        if (p < 0 || p > 1) return { ok: false as const, error: "p must be in [0,1]" };
        return { ok: true as const };
    }

    static shapeCompute(_data: DropData, inputShapes: number[][]) {
        return [...(inputShapes[0] || [])];
    }

    static estimateCost(_data: DropData, _inputShapes: number[][], outputShape: number[]) {
        return estimateElementwiseCost(outputShape);
    }
    static getInitCode(data: DropData, name: string) {
        return buildInitString("nn.StochasticDepth", name, StochasticDepthNode.paramSchema, data as any);
    }

    static getForwardCode(_data: DropData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<any>(StochasticDepthNode.label, StochasticDepthNode.paramSchema);
}
