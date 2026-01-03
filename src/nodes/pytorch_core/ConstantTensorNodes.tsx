import { type FieldSpec } from "../../node_gen/BaseClass";
import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";
import { type HandleSchema } from "../../types/handleTypes";

type CreateData = { shape: string };

function parseShape(raw: string): number[] | null {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const dims: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) return null;
    dims.push(n);
  }
  return dims;
}

function makeConstant(label: string, fnName: "zeros" | "ones" | "rand") {
  return class ConstantNode {
    static label = label;
    static paramSchema: Record<string, FieldSpec> = {
      shape: {
        required: true,
        type: "text",
        label: "Shape (comma)",
        defaultValue: "1,1",
      },
    };

    static handleSchema: HandleSchema<CreateData> = {
      inputs: [],
      outputs: [
        { id: "out", type: "output", defaultLabel: "tensor", position: 0 },
      ],
    };

    static shapeVerifier(data: CreateData) {
      const dims = parseShape(data.shape || "");
      if (!dims)
        return { ok: false as const, error: "Shape must be positive integers" };
      return { ok: true as const };
    }

    static shapeCompute(data: CreateData) {
      return parseShape(data.shape || "") || [];
    }

    static getInitCode() {
      return "# constant tensor created in forward";
    }

    static getForwardCode(
      data: CreateData,
      _name: string,
      _inputs: Array<string>,
      outputs: Array<string>
    ) {
      const out = outputs[0] || "x";
      const shape = data.shape || "";
      return `${out} = torch.${fnName}(${shape})`;
    }

    static Component = createLayerComponent<CreateData>(
      label,
      ConstantNode.paramSchema,
      {
        handleSchema: ConstantNode.handleSchema,
      }
    );
  };
}

export const ZerosNode = makeConstant("Zeros", "zeros");
export const OnesNode = makeConstant("Ones", "ones");
export const RandNode = makeConstant("Rand", "rand");
