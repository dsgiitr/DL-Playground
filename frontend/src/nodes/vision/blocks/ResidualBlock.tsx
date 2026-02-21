import { getParamValue, type FieldSpec } from "../../../node_gen/BaseClass";
import { estimateConvCost, estimateElementwiseCost } from "../../../utils/computeUtils";
import { createLayerComponent } from "../../../node_gen/CreateNodeComponent.tsx";

type ResidualData = {
    channels: number;
    kernel_size?: number;
    use_bn?: boolean;
};

export class ResidualBlockNode {
    static label = "Residual Block";
    static paramSchema: Record<string, FieldSpec> = {
        channels: { required: true, type: "number", label: "Channels", defaultValue: 64, step: 1 },
        kernel_size: { required: false, type: "number", label: "Kernel Size", defaultValue: 3, step: 1 },
        use_bn: { required: false, type: "boolean", label: "Use BatchNorm", defaultValue: true }
    };
    static handles = { targets: ["in-0"], sources: ["out_main", "out_skip"] };

    static shapeVerifier(data: ResidualData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Residual block expects exactly one input" };
        const shape = inputShapes[0];
        if (shape.length < 3) return { ok: false as const, error: "Expected NCHW or similar tensor" };
        const channels = getParamValue(this, data, "channels") as number;
        if (shape[1] !== channels) return { ok: false as const, error: `Expected ${channels} channels, got ${shape[1]}` };
        return { ok: true as const };
    }
    static shapeCompute(_data: ResidualData, inputShapes: number[][]) {
        const shape = inputShapes[0] || [];
        return {
            out_main: shape,
            out_skip: shape
        };
    }

    static estimateCost(data: ResidualData, _inputShapes: number[][], outputShape: number[]) {
        const channels = getParamValue(this, data, "channels") as number;
        const k = getParamValue(this, data, "kernel_size") as number;
        const useBn = !!getParamValue(this, data, "use_bn");
        const convCost = estimateConvCost(outputShape, channels, channels, k * k, true);
        const elementOps = estimateElementwiseCost(outputShape, useBn ? 3 : 2);
        const bnParams = useBn ? channels * 2 : 0;
        return {
            params: convCost.params + bnParams,
            flops: convCost.flops + elementOps.flops
        };
    }

    static getInitCode(data: ResidualData, name: string) {
        const c = getParamValue(this, data, "channels") as number;
        const k = getParamValue(this, data, "kernel_size") ?? 3;
        const useBn = getParamValue(this, data, "use_bn");
        const padding = Math.floor((k as number) / 2);
        const bnLine = useBn ? `\n        self.${name}_bn = nn.BatchNorm2d(num_features=${c})` : "";
        return `self.${name}_conv = nn.Conv2d(in_channels=${c}, out_channels=${c}, kernel_size=${k}, padding=${padding})${bnLine}`;
    }
    static getForwardCode(data: ResidualData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const x = inputs[0] || "x";
        const outMain = outputs[0] || `${name}_out_main`;
        const outSkip = outputs[1] || `${name}_out_skip`;
        const useBn = getParamValue(this, data, "use_bn");
        const conv = `${outMain} = self.${name}_conv(${x})`;
        const bn = useBn ? `\n        ${outMain} = self.${name}_bn(${outMain})` : "";
        const act = `\n        ${outMain} = torch.relu(${outMain})`;
        const skip = `\n        ${outSkip} = ${x} + ${outMain}`;
        return `${conv}${bn}${act}${skip}`;
    }
    static Component = createLayerComponent<ResidualData>(ResidualBlockNode.label, ResidualBlockNode.paramSchema, {
        targetHandles: 1,
        handles: ResidualBlockNode.handles
    });
}
