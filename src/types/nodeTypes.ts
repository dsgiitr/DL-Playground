import type { NodeTypes } from "@xyflow/react";
import { type LayerDefinition } from "../custom_nodes/BaseClass";
import { LinearLayerNode } from "../custom_nodes/LinearLayer";
import { CNNLayerNode } from "../custom_nodes/CNNLayerNode";
import { InputNode } from "../custom_nodes/InputNode";
import { FlattenNode } from "../custom_nodes/FlattenNode";


// This is the core Layer registory. it forms the bridge between the 
export const LAYER_REGISTRY: Record<string, LayerDefinition<any>> = {
    input_layer: InputNode,
    linear_layer: LinearLayerNode,
    cnn_layer: CNNLayerNode,
    flatten_layer: FlattenNode
};
export const nodeTypes: NodeTypes = Object.entries(LAYER_REGISTRY).reduce((acc, [key, Class]) => {
    acc[key] = Class.Component;
    return acc;
}, {} as any);
