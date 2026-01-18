import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent";

type TensorShapeData = {};

export class TensorShapeNode {
    static label = "Tensor Shape";
    static diagramLabel = "Shape";

    static paramSchema: Record<string, FieldSpec> = {};

    static handles = {
        targets: ["in"],
        sources: ["shape"],
    };

    static shapeVerifier() {
        return { ok: true as const };
    }

    static shapeCompute() {
        return [];
    }

    static getInitCode() {
        return "";
    }

    static getForwardCode(
    _data: TensorShapeData,
    _name: string,
    inputs: string[],
    outputs: string[]
    ) {
        const x = inputs[0];
        const out = outputs[0];

        return `
    _shape = list(${x}.shape)
    ${out} = {
        "dims": _shape,
        "rank": len(_shape),
        "at": lambda i, _s=_shape: _s[i],
    }
    `;
    }

    static Component = createLayerComponent<TensorShapeData>(
        TensorShapeNode.label,
        TensorShapeNode.paramSchema
    );
}
