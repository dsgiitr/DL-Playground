import { createLayerComponent, type FieldSpec } from "./BaseClass";

type InputData = {
    batch?: number;
    channels?: number;
    height?: number;
    width?: number;
};

const getVal = (val: number | undefined, fallback: number) =>
    typeof val === "number" && !Number.isNaN(val) ? val : fallback;

export class InputNode {
    static label = "Input";
    static paramSchema: Record<string, FieldSpec> = {
        batch: { required: false, type: "number", label: "Batch", defaultValue: 1, step: 1 },
        channels: { required: true, type: "number", label: "Channels", defaultValue: 3, step: 1 },
        height: { required: true, type: "number", label: "Height", defaultValue: 32, step: 1 },
        width: { required: true, type: "number", label: "Width", defaultValue: 32, step: 1 },
    };

    static shapeVerifier(data: InputData) {
        const b = getVal(data.batch, this.paramSchema.batch.defaultValue!);
        const c = getVal(data.channels, this.paramSchema.channels.defaultValue!);
        const h = getVal(data.height, this.paramSchema.height.defaultValue!);
        const w = getVal(data.width, this.paramSchema.width.defaultValue!);
        if (b <= 0 || c <= 0 || h <= 0 || w <= 0) {
            return { ok: false as const, error: "All dimensions must be > 0" };
        }
        return { ok: true as const };
    }

    static shapeCompute(data: InputData) {
        const b = getVal(data.batch, this.paramSchema.batch.defaultValue!);
        const c = getVal(data.channels, this.paramSchema.channels.defaultValue!);
        const h = getVal(data.height, this.paramSchema.height.defaultValue!);
        const w = getVal(data.width, this.paramSchema.width.defaultValue!);
        return [b, c, h, w];
    }

    static getInitCode() {
        return "# input layer does not require initialization";
    }

    static getForwardCode(_data: InputData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        return `${outputVar} = ${inputVar}  # input passthrough`;
    }

    static Component = createLayerComponent<InputData>(InputNode.label, InputNode.paramSchema, InputNode.shapeCompute);
}
