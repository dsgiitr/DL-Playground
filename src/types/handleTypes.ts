export type HandleShapeCompute<D> = (
  data: D,
  inputShapes: number[][],
  handleId: string
) => number[];

export interface HandleDefinition<D = any> {
  id: string;
  type: "input" | "output";
  position: number;
  shapeCompute: HandleShapeCompute<D>;
  label?: string;
}

export interface HandleSchema<D = any> {
  inputs: HandleDefinition<D>[];
  outputs: HandleDefinition<D>[];
}
