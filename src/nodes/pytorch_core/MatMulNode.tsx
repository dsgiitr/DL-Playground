import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type MatMulData = Record<string, never>;

export class MatMulNode {
    static label = "MatMul";
    static paramSchema: Record<string, FieldSpec> = {};
    static handles = { targets: ["in-0", "in-1"], sources: ["out-0"] };

    static shapeVerifier(_data: MatMulData, inputShapes: number[][]) {
        if (inputShapes.length !== 2) return { ok: false as const, error: "MatMul expects two inputs" };
        const [a, b] = inputShapes;
        if (a.length < 2 || b.length < 2) return { ok: false as const, error: "Inputs must be at least 2D" };
        const aK = a[a.length - 1];
        const bK = b[b.length - 2];
        if (aK !== bK) return { ok: false as const, error: `Inner dims must align (${aK} vs ${bK})` };
        return { ok: true as const };
    }

    static shapeCompute(_data: MatMulData, inputShapes: number[][]) {
        const [a, b] = inputShapes;
        const batch = a.slice(0, -2);
        const m = a[a.length - 2];
        const n = b[b.length - 1];
        return [...batch, m, n];
    }

    static getInitCode() {
        return "# matmul uses torch.matmul";
    }

    static getForwardCode(_data: MatMulData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const out = outputs[0] || "x";
        const left = inputs[0] || "x";
        const right = inputs[1] || "y";
        return `${out} = torch.matmul(${left}, ${right})`;
    }

    static Component = createLayerComponent<MatMulData>(MatMulNode.label, MatMulNode.paramSchema, { targetHandles: 2 });
}
