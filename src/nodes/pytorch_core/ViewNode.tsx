import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";

type ViewData = {
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

export class ViewNode {
    static label = "View";
    static handles = {
        targets: ["in", "shape"], // tensor + optional runtime shape
        sources: ["out"],
    };
    static paramSchema: Record<string, FieldSpec> = {
        target_shape: {
            required: true,
            type: "text",
            label: "Target (comma nums, -1 ok)",
            defaultValue: "-1",
        },
    };

    static shapeVerifier(data: ViewData, inputShapes: number[][]) {
        if (inputShapes.length !== 1) {
            return { ok: false as const, error: "View expects one input" };
        }
        const shape = inputShapes[0];
        const dims = parseDims(data.target_shape ?? "");
        if (!dims) {
            return { ok: false as const, error: "Target shape must be comma-separated integers" };
        }
        const minusOnes = dims.filter(d => d === -1).length;
        if (minusOnes > 1) {
            return { ok: false as const, error: "Only one -1 is allowed" };
        }
        const inputElems = shape.reduce((acc, v) => acc * v, 1);
        const knownProd = dims.filter(d => d !== -1).reduce((acc, v) => acc * v, 1);
        if (minusOnes === 0 && knownProd !== inputElems) {
            return {
                ok: false as const,
                error: `Element count mismatch: input=${inputElems}, target=${knownProd}`,
            };
        }
        return { ok: true as const };
    }

    static shapeCompute(data: ViewData, _inputShapes: number[][]) {
        const dims = parseDims(data.target_shape ?? "");
        return dims ?? [];
    }

    static estimateCost() {
        return { params: 0, flops: 0 };
    }

    static getInitCode() {
        return "# view handled in forward";
    }

    static getForwardCode(
        data: ViewData,
        _name: string,
        inputs: Array<string>,
        outputs: Array<string>
    ) {
        const out = outputs[0] || "x";
        const inputVar = inputs[0] || "x";
        const shapeVar = inputs[1];

        // Runtime shape-driven view
        if (shapeVar) {
            return `${out} = ${inputVar}.view(*${shapeVar}["dims"])`;
        }

        // Backward-compatible param-based view
        const dims = data.target_shape || "-1";
        return `${out} = ${inputVar}.view(${dims})`;
    }

    static Component = createLayerComponent<ViewData>(
        ViewNode.label,
        ViewNode.paramSchema
    );
}
