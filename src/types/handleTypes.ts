/**
 * Handle type system for multi-output nodes and handle-based naming.
 * 
 * Handles are the connection points on nodes. Each handle can have:
 * - A unique ID within the node
 * - A user-editable label (used as variable name in codegen)
 * - A position/order (determines visual placement and tuple unpacking order)
 * - Optional per-handle shape computation
 */

export type HandleType = 'input' | 'output';

/**
 * Compute output shape for a specific handle.
 * Used by multi-output nodes where each output has different shape.
 */
export type HandleShapeCompute<D = any> = (
    data: D,
    inputShapes: number[][],
    handleId: string
) => number[];

/**
 * Definition of a single handle on a node.
 */
export interface HandleDefinition<D = any> {
    /** Unique ID within this node (e.g., "conv_out", "flat_out") */
    id: string;
    
    /** Input or output handle */
    type: HandleType;
    
    /** Default label for this handle (used if user doesn't customize) */
    defaultLabel?: string;
    
    /** 
     * Visual position order (0-indexed).
     * Determines vertical placement and tuple unpacking order.
     * Lower values appear higher visually and earlier in tuple unpacking.
     */
    position: number;
    
    /**
     * Optional per-handle shape computation.
     * If provided, overrides the layer's default shapeCompute for this output.
     */
    shapeCompute?: HandleShapeCompute<D>;
    
    /** User-customized label (stored in node data) */
    label?: string;
}

/**
 * Complete handle schema for a layer, defining all inputs and outputs.
 */
export interface HandleSchema<D = any> {
    inputs: HandleDefinition<D>[];
    outputs: HandleDefinition<D>[];
}

/**
 * Factory function that generates handle schema based on layer data.
 * Useful for dynamic handle counts (e.g., Concat with variable inputs).
 */
export type HandleSchemaFactory<D = any> = (data: D) => HandleSchema<D>;
