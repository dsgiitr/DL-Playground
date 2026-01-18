import { type LayerDefinition } from "../node_gen/BaseClass";
/**
 * This module defines an empty LAYER_REGISTRY to act as a placeholder
 */
// 1. Define the Registry Object (Empty initially)
export const LAYER_REGISTRY: Record<string, LayerDefinition<any>> = {};

// 2. Helper to populate it safely
export function registerLayer(key: string, cls: LayerDefinition<any>) {
    LAYER_REGISTRY[key] = cls;
}
