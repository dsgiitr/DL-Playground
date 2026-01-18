/**
 * Handle type system for multi-output nodes and handle-based naming.
 */

export type HandleType = "input" | "output";
export type HandleShapeCompute<D = any> = (
  data: D,
  inputShapes: number[][],
  handleId: string,
) => number[];
export interface HandleDefinition<D = any> {
  id: string;
  type: HandleType;
  defaultLabel?: string;
  position: number;
  shapeCompute?: HandleShapeCompute<D>;

  /** User-customized label (stored in node data) */
  edgeLabel?: string;
}
export interface HandleSchema<D = any> {
  inputs: HandleDefinition<D>[];
  outputs: HandleDefinition<D>[];
}
export type HandleSchemaFactory<D = any> = (data: D) => HandleSchema<D>;
