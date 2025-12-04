import type { NodeTypes } from "@xyflow/react";
import { LinearLayerNode, type LayerStatic } from "../custom_nodes/BaseClass";
// import LinearLayer from "../custom_nodes/LinearLayer";

const LAYER_REGISTRY: Record<string, LayerStatic<any>> = {
    linear_layer: LinearLayerNode,
    // cnn_layer: CNNLayerNode
};
export const nodeTypes: NodeTypes = Object.entries(LAYER_REGISTRY).reduce((acc, [key, Class]) => {
    acc[key] = Class.Node;
    return acc;
}, {} as any);
