import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";


type TransposeData = {
    perm: string;
};

function parsePerm(raw: string): number[] | null {
    const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    const perm: number[] = [];
    for (const p of parts) {
        const n = Number(p);
        if (!Number.isInteger(n)) return null;
        perm.push(n);
    }
    return perm;
}

export class TransposeNode {
    static label = "Transpose";
    static handles = {
        targets: ["in", "shape"],
        sources: ["out"],
    };
    static paramSchema: Record<string, FieldSpec> = {
        perm: { required: true, type: "text", label: "Perm (comma)", defaultValue: "0,2,3,1" },
    };

    static shapeVerifier(data: TransposeData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) return { ok: false as const, error: "Transpose expects one input" };
        const shape = inputShapes[0];
        const perm = parsePerm(data.perm ?? "");
        if (!perm) return { ok: false as const, error: "Permutation must be comma-separated integers" };
        if (perm.length !== shape.length) return { ok: false as const, error: "Permutation length must match rank" };
        const set = new Set(perm);
        if (set.size !== perm.length || Math.min(...perm) < 0 || Math.max(...perm) >= shape.length) {
            return { ok: false as const, error: "Permutation must be a valid reordering of dimensions" };
        }
        return { ok: true as const };
    }

    static shapeCompute(data: TransposeData, inputShapes: number[][]) {
        const shape = inputShapes[0];
        const perm = parsePerm(data.perm ?? "") || [];
        return perm.map(i => shape[i]);
    }

    static estimateCost() {
        return { params: 0, flops: 0 };
    }

    static getInitCode() {
        return "# transpose handled in forward";
    }

    static getForwardCode(
        data: TransposeData,
        _name: string,
        inputs: Array<string>,
        outputs: Array<string>
    ) {
        const out = outputs[0] || "x";
        const inputVar = inputs[0] || "x";
        const shapeVar = inputs[1]; // optional runtime shape dict

        // Case 1: runtime shape-driven transpose
        if (shapeVar) {
            return `
_perm = list(range(len(${shapeVar}["dims"])))
_perm.reverse()
${out} = ${inputVar}.permute(*_perm)
`;
        }
        const perm = data.perm || "";
        return `${out} = ${inputVar}.permute(${perm})`;
    }

    static computeShape(_data: TransposeData) {
        return [];
    }

    static Component = createLayerComponent<TransposeData>(TransposeNode.label, TransposeNode.paramSchema);
}
