import type { NodeTypes } from "@xyflow/react";
import { type LayerDefinition } from "../node_gen/BaseClass";
import { LinearLayerNode } from "../custom_nodes/LinearLayer";
import { CNNLayerNode } from "../custom_nodes/CNNLayerNode";
import { InputNode } from "../custom_nodes/InputNode";
import { FlattenNode } from "../custom_nodes/FlattenNode";
import { MaxPool2dNode } from "../custom_nodes/MaxPool2dNode";
import { ConcatNode } from "../custom_nodes/ConcatNode";
import { AddNode } from "../node_gen/AddNode";
import { ReshapeNode } from "../custom_nodes/ReshapeNode";
import { TransposeNode } from "../custom_nodes/TransposeNode";


// This is the core Layer registory. it forms the bridge between the 
export const LAYER_REGISTRY: Record<string, LayerDefinition<any>> = {
    input_layer: InputNode,
    linear_layer: LinearLayerNode,
    cnn_layer: CNNLayerNode,
    flatten_layer: FlattenNode,
    maxpool2d_layer: MaxPool2dNode,
    concat_layer: ConcatNode,
    add_layer: AddNode,
    reshape_layer: ReshapeNode,
    transpose_layer: TransposeNode
};
export const nodeTypes: NodeTypes = Object.entries(LAYER_REGISTRY).reduce((acc, [key, Class]) => {
    acc[key] = Class.Component;
    return acc;
}, {} as any);
