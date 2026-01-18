/**
 * Utility functions for working with handle schemas.
 * Resolves static handle definitions and dynamic factories.
 */

import type {
  LayerDefinition,
  HandleSpec,
  HandleFactory,
  LayerData,
} from "../node_gen/BaseClass";
import type {
  HandleDefinition,
  HandleSchema,
  HandleSchemaFactory,
} from "../types/handleTypes";

/**
 * Resolve a layer's handle schema, supporting both static and dynamic schemas.
 */
export function resolveHandleSchema<D extends LayerData>(
  layer: LayerDefinition<D> | undefined,
  data: Partial<D>,
): HandleSchema<D> {
  if (!layer) {
    return { inputs: [], outputs: [] };
  }

  // Try handleSchema first (new system)
  if (layer.handleSchema) {
    const schema = layer.handleSchema;
    if (typeof schema === "function") {
      // It's a factory
      return (schema as HandleSchemaFactory<D>)(data as D);
    }
    return schema as HandleSchema<D>;
  }

  // Fall back to legacy handles system
  if (layer.handles) {
    const spec =
      typeof layer.handles === "function"
        ? (layer.handles as HandleFactory<D>)(data as D)
        : (layer.handles as HandleSpec);

    const toDefs = (
      ids: string[] | undefined,
      type: "input" | "output",
    ): HandleDefinition[] => {
      if (!ids?.length) return [];
      return ids.map((id, idx) => ({
        id,
        type,
        position: idx,
        defaultLabel: id,
      }));
    };

    return {
      inputs: toDefs(spec?.targets, "input"),
      outputs: toDefs(spec?.sources, "output"),
    };
  }

  // Default single input/output
  return {
    inputs: [{ id: "in-0", type: "input", position: 0, defaultLabel: "in" }],
    outputs: [
      { id: "out-0", type: "output", position: 0, defaultLabel: "out" },
    ],
  };
}

/**
 * Get label info for a specific handle (input or output).
 * Returns both the user label (if set) and default label.
 */
export function getHandleLabelInfo(
  layer: LayerDefinition<any> | undefined,
  data: any,
  handleId: string,
  direction: "input" | "output",
) {
  const schema = resolveHandleSchema(layer, data);
  const handles = direction === "input" ? schema.inputs : schema.outputs;
  const handle = handles.find((h) => h.id === handleId);

  return {
    label: handle?.edgeLabel,
    defaultLabel: handle?.defaultLabel || handleId,
  };
}
