import { type FieldSpec } from "../node_gen/BaseClass";
import {createLayerComponent} from '../node_gen/CreateNodeComponent.tsx'


type ReshapeData = {
    target_shape: string;
};

function parseDims(raw: string): number[] | null {
    const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    const dims: number[] = [];
    for (const p of parts) {
        const n = Number(p);
        if (!Number.isInteger(n)) return null;
        dims.push(n);
    }
    return dims;
}

export class ReshapeNode {
    static label = "Reshape";
    static paramSchema: Record<string, FieldSpec> = {
        target_shape: { required: true, type: "text", label: "Target (comma nums, -1 ok)", defaultValue: "-1" },
    };

    static shapeVerifier(data: ReshapeData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Reshape expects one input" };
        const shape = inputShapes[0];
        const dims = parseDims(data.target_shape ?? "");
        if (!dims) return { ok: false as const, error: "Target shape must be comma-separated integers" };
        const minusOnes = dims.filter(d => d === -1).length;
        if (minusOnes > 1) return { ok: false as const, error: "Only one -1 is allowed" };
        const inputElems = shape.reduce((acc, v) => acc * v, 1);
        const knownProd = dims.filter(d => d !== -1).reduce((acc, v) => acc * v, 1);
        if (minusOnes === 0) {
            if (knownProd !== inputElems) return { ok: false as const, error: `Element count mismatch: input=${inputElems}, target=${knownProd}` };
        } else {
            if (inputElems % knownProd !== 0) return { ok: false as const, error: "Cannot infer -1 dimension (not divisible)" };
        }
        return { ok: true as const };
    }

    static shapeCompute(data: ReshapeData, inputShapes: number[][]) {
        const shape = inputShapes[0];
        const dims = parseDims(data.target_shape ?? "") || [];
        const inputElems = shape.reduce((acc, v) => acc * v, 1);
        const knownProd = dims.filter(d => d !== -1).reduce((acc, v) => acc * v, 1);
        if (dims.includes(-1)) {
            const inferred = inputElems / knownProd;
            return dims.map(d => (d === -1 ? inferred : d));
        }
        return dims;
    }

    static getInitCode() {
        return "# reshape handled in forward";
    }

    static getForwardCode(data: ReshapeData, _name: string, inputs: Array<string>, outputs: Array<string>) {
        const out = outputs[0] || "x";
        const inputVar = inputs[0] || "x";
        const dims = data.target_shape || "-1";
        return `${out} = ${inputVar}.view(${dims})`;
    }
    static Component = createLayerComponent<ReshapeData>(ReshapeNode.label, ReshapeNode.paramSchema);
}
