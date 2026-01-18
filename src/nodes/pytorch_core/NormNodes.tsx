import { buildInitString, getParamValue, type FieldSpec } from "../../node_gen/BaseClass";
import { toNumber } from "../../utils/computeUtils";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type NormData = {
    num_features?: number;
    eps?: number;
    affine?: boolean;
    momentum?: number;
    num_groups?: number;
    normalized_shape?: number;
};

export class BatchNorm2dNode {
    static label = "BatchNorm2d";
    static paramSchema: Record<string, FieldSpec> = {
        num_features: { required: true, type: "number", label: "Channels", defaultValue: 32, step: 1 },
        eps: { required: false, type: "number", label: "Eps", defaultValue: 1e-5 },
        momentum: { required: false, type: "number", label: "Momentum", defaultValue: 0.1 },
        affine: { required: false, type: "boolean", label: "Affine", defaultValue: true }
    };

    static shapeVerifier(data: NormData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "BatchNorm2d expects one input" };
        const shape = inputShapes[0];
        if (shape.length < 3) return { ok: false as const, error: "Expected N,C,H,W or N,C,L" };
        const ch = shape[1];
        const num = getParamValue(this, data, "num_features") as number;
        if (ch !== num) return { ok: false as const, error: `Expected ${num} channels, got ${ch}` };
        return { ok: true as const };
    }

    static shapeCompute(_data: NormData, inputShapes: number[][]) {
        return [...(inputShapes[0] || [])];
    }

    static estimateCost(data: NormData, _inputShapes: number[][], _outputShape: number[]) {
        const affine = data.affine !== false;
        const channels = toNumber(getParamValue(this, data, "num_features"), 0);
        const params = affine ? channels * 2 : 0;
        return { params, flops: 0 };
    }

    static getInitCode(data: NormData, name: string) {
        return buildInitString("nn.BatchNorm2d", name, BatchNorm2dNode.paramSchema, data);
    }

    static getForwardCode(_data: NormData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = self.${name}(${inputVar})`;
    }

    static Component = createLayerComponent<NormData>(BatchNorm2dNode.label, BatchNorm2dNode.paramSchema);
}

export class InstanceNorm2dNode {
    static label = "InstanceNorm2d";
    static paramSchema: Record<string, FieldSpec> = BatchNorm2dNode.paramSchema;

    static shapeVerifier = BatchNorm2dNode.shapeVerifier;
    static shapeCompute = BatchNorm2dNode.shapeCompute;
    static estimateCost = BatchNorm2dNode.estimateCost;

    static getInitCode(data: NormData, name: string) {
        return buildInitString("nn.InstanceNorm2d", name, InstanceNorm2dNode.paramSchema, data);
    }
    static getForwardCode = BatchNorm2dNode.getForwardCode;
    static Component = createLayerComponent<NormData>(InstanceNorm2dNode.label, InstanceNorm2dNode.paramSchema);
}

export class GroupNormNode {
    static label = "GroupNorm";
    static paramSchema: Record<string, FieldSpec> = {
        num_groups: { required: true, type: "number", label: "Groups", defaultValue: 8, step: 1 },
        num_features: { required: true, type: "number", label: "Channels", defaultValue: 32, step: 1 },
        eps: { required: false, type: "number", label: "Eps", defaultValue: 1e-5 },
        affine: { required: false, type: "boolean", label: "Affine", defaultValue: true }
    };

    static shapeVerifier(data: NormData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "GroupNorm expects one input" };
        const shape = inputShapes[0];
        if (shape.length < 2) return { ok: false as const, error: "Expected N,C,..." };
        const ch = shape[1];
        const numFeat = getParamValue(this, data, "num_features") as number;
        const groups = getParamValue(this, data, "num_groups") as number;
        if (ch !== numFeat) return { ok: false as const, error: `Expected ${numFeat} channels, got ${ch}` };
        if (groups <= 0 || numFeat % groups !== 0) return { ok: false as const, error: "num_features must be divisible by num_groups" };
        return { ok: true as const };
    }

    static shapeCompute(_data: NormData, inputShapes: number[][]) {
        return [...(inputShapes[0] || [])];
    }

    static estimateCost(data: NormData, _inputShapes: number[][], _outputShape: number[]) {
        const affine = data.affine !== false;
        const channels = toNumber(getParamValue(this, data, "num_features"), 0);
        const params = affine ? channels * 2 : 0;
        return { params, flops: 0 };
    }
    static getInitCode(data: NormData, name: string) {
        return buildInitString("nn.GroupNorm", name, GroupNormNode.paramSchema, data);
    }

    static getForwardCode = BatchNorm2dNode.getForwardCode;

    static Component = createLayerComponent<NormData>(GroupNormNode.label, GroupNormNode.paramSchema);
}

export class LayerNormNode {
    static label = "LayerNorm";
    static paramSchema: Record<string, FieldSpec> = {
        normalized_shape: { required: true, type: "number", label: "Last Dim", defaultValue: 128, step: 1 },
        eps: { required: false, type: "number", label: "Eps", defaultValue: 1e-5 },
        affine: { required: false, type: "boolean", label: "Affine", defaultValue: true }
    };

    static shapeVerifier(data: NormData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "LayerNorm expects one input" };
        const shape = inputShapes[0];
        if (!shape.length) return { ok: false as const, error: "Input shape must be defined" };
        const last = shape[shape.length - 1];
        const norm = getParamValue(this, data, "normalized_shape") as number;
        if (last !== norm) return { ok: false as const, error: `Expected last dim ${norm}, got ${last}` };
        return { ok: true as const };
    }

    static shapeCompute(_data: NormData, inputShapes: number[][]) {
        return [...(inputShapes[0] || [])];
    }

    static estimateCost(data: NormData, _inputShapes: number[][], _outputShape: number[]) {
        const affine = data.affine !== false;
        const norm = toNumber(getParamValue(this, data, "normalized_shape"), 0);
        const params = affine ? norm * 2 : 0;
        return { params, flops: 0 };
    }
    static getInitCode(data: NormData, name: string) {
        return buildInitString("nn.LayerNorm", name, LayerNormNode.paramSchema, data);
    }

    static getForwardCode = BatchNorm2dNode.getForwardCode;

    static Component = createLayerComponent<NormData>(LayerNormNode.label, LayerNormNode.paramSchema);
}

export class RMSNormNode {
    static label = "RMSNorm";
    static paramSchema: Record<string, FieldSpec> = {
        normalized_shape: { required: true, type: "number", label: "Last Dim", defaultValue: 128, step: 1 },
        eps: { required: false, type: "number", label: "Eps", defaultValue: 1e-6 }
    };

    static shapeVerifier = LayerNormNode.shapeVerifier;
    static shapeCompute = LayerNormNode.shapeCompute;

    static estimateCost(data: NormData, _inputShapes: number[][], _outputShape: number[]) {
        const norm = toNumber(getParamValue(this, data, "normalized_shape"), 0);
        return { params: norm, flops: 0 };
    }
    static getInitCode(data: NormData, name: string) {
        return buildInitString("nn.RMSNorm", name, RMSNormNode.paramSchema, data);
    }

    static getForwardCode = BatchNorm2dNode.getForwardCode;

    static Component = createLayerComponent<NormData>(RMSNormNode.label, RMSNormNode.paramSchema);
}
