import type { NodeTypes } from "@xyflow/react";
import { type LayerDefinition } from "../custom_nodes/BaseClass";
import {LinearLayerNode} from "../custom_nodes/LinearLayer";
import { CNNLayerNode } from "../custom_nodes/CNNLayerNode";

export const LAYER_REGISTRY: Record<string, LayerDefinition<any>> = {
    linear_layer: LinearLayerNode,
    cnn_layer: CNNLayerNode
};
export const nodeTypes: NodeTypes = Object.entries(LAYER_REGISTRY).reduce((acc, [key, Class]) => {
    acc[key] = Class.Component;
    return acc;
}, {} as any);
