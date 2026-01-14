import { type LayerDefinition } from "../node_gen/BaseClass";
import { registerLayer, LAYER_REGISTRY } from "../utils/layerRegistry";
import { AddNode } from "./pytorch_core/AddNode";
import { ConcatNode } from "./pytorch_core/ConcatNode";
import { FlattenNode } from "./pytorch_core/FlattenNode";
import { ReshapeNode } from "./pytorch_core/ReshapeNode";
import { TransposeNode } from "./pytorch_core/TransposeNode";
import { LinearLayerNode } from "./dense/LinearLayer";
import { InputNode } from "./inputs/InputNode";
import { Conv1dNode } from "./vision/conv/Conv1dNode";
import { Conv2dNode } from "./vision/conv/Conv2dNode";
import { Conv3dNode } from "./vision/conv/Conv3dNode";
import { DepthwiseConv2dNode } from "./vision/conv/DepthwiseConv2dNode";
import { PointwiseConv2dNode } from "./vision/conv/PointwiseConv2dNode";
import { ConvTranspose2dNode } from "./vision/conv/ConvTranspose2dNode";
import { UpsampleNode } from "./vision/conv/UpsampleNode";
import { MaxPool2dNode } from "./vision/pooling/MaxPool2dNode";
import { MaxPool1dNode } from "./vision/pooling/MaxPool1dNode";
import { AvgPool2dNode } from "./vision/pooling/AvgPool2dNode";
import { AvgPool1dNode } from "./vision/pooling/AvgPool1dNode";
import { AdaptiveAvgPool2dNode } from "./vision/pooling/AdaptiveAvgPool2dNode";
import { AdaptiveMaxPool2dNode } from "./vision/pooling/AdaptiveMaxPool2dNode";
import { GlobalAvgPool2dNode } from "./vision/pooling/GlobalAvgPool2dNode";
import { GlobalMaxPool2dNode } from "./vision/pooling/GlobalMaxPool2dNode";
import { MaxPool3dNode } from "./vision/pooling/MaxPool3dNode";
import { AvgPool3dNode } from "./vision/pooling/AvgPool3dNode";
import { ResidualBlockNode } from "./vision/blocks/ResidualBlock";
import { EmbeddingNode } from "./sequence/EmbeddingNode";
import { RNNNode } from "./sequence/RNNNode";
import { LSTMNode } from "./sequence/LSTMNode";
import { GRUNode } from "./sequence/GRUNode";
import { MultiheadAttentionNode } from "./sequence/MultiheadAttentionNode";
import { PositionalEncodingNode } from "./sequence/PositionalEncodingNode";
import { MSELossNode } from "./losses/MSELossNode";
import { CrossEntropyLossNode } from "./losses/CrossEntropyLossNode";
import { BCELossNode } from "./losses/BCELossNode";
import { AccuracyNode } from "./metrics/AccuracyNode";
import { ZerosNode, OnesNode, RandNode } from "./pytorch_core/ConstantTensorNodes";
import { RepeatNode } from "./pytorch_core/RepeatNode";
import { makeElementwiseBinary } from "./pytorch_core/ElementwiseBinaryNode";
import { makeUnaryElementwise } from "./pytorch_core/UnaryElementwiseNode";
import { MatMulNode } from "./pytorch_core/MatMulNode";
import { PowNode } from "./pytorch_core/PowNode";
import { ClipNode } from "./pytorch_core/ClipNode";
import { makeReduction } from "./pytorch_core/ReductionNode";
import { RepeatLayerNode } from "./control_flow/RepeatLayer";
import {
    ReLUNode,
    LeakyReLUNode,
    GELUNode,
    ELUNode,
    SELUNode,
    TanhNode,
    SigmoidNode,
    SoftplusNode,
    SoftsignNode,
    HardSwishNode,
    HardSigmoidNode,
} from "./pytorch_core/activations";
import { SoftmaxNode, LogSoftmaxNode } from "./pytorch_core/SoftmaxNode";
import { ProdNode, MaxNode, MinNode, ArgMaxNode, ArgMinNode } from "./pytorch_core/ArgExtremaNodes";
import {
    BatchNorm2dNode,
    InstanceNorm2dNode,
    GroupNormNode,
    LayerNormNode,
    RMSNormNode,
} from "./pytorch_core/NormNodes";
import { DropoutNode, SpatialDropout2dNode, AlphaDropoutNode, StochasticDepthNode } from "./pytorch_core/RegNodes";
import { ModuleRefNode } from "./ModuleRefNode";

export type NodeGroup = {
    label: string;
    nodes: Record<string, any>;
};

// Node catalog grouped by modality/usage. This keeps the registry modular and
// mirrors the folder layout so it is easy to extend.
export const NODE_GROUPS: Record<string, NodeGroup> = {
    inputs: {
        label: "Inputs",
        nodes: { input_layer: InputNode },
    },
    torch_ops: {
        label: "Torch Ops",
        nodes: (() => {
            const SubNode = makeElementwiseBinary("Sub", "-");
            const MulNode = makeElementwiseBinary("Mul", "*");
            const DivNode = makeElementwiseBinary("Div", "/");
            const ExpNode = makeUnaryElementwise("Exp", input => `torch.exp(${input})`);
            const LogNode = makeUnaryElementwise("Log", input => `torch.log(${input})`);
            const SqrtNode = makeUnaryElementwise("Sqrt", input => `torch.sqrt(${input})`);
            const SumNode = makeReduction("Sum", "sum");
            const MeanNode = makeReduction("Mean", "mean");

            return {
                add_layer: AddNode,
                concat_layer: ConcatNode,
                sub_layer: SubNode,
                mul_layer: MulNode,
                div_layer: DivNode,
                exp_layer: ExpNode,
                log_layer: LogNode,
                sqrt_layer: SqrtNode,
                pow_layer: PowNode,
                clip_layer: ClipNode,
                matmul_layer: MatMulNode,
                sum_layer: SumNode,
                mean_layer: MeanNode,
                prod_layer: ProdNode,
                max_layer: MaxNode,
                min_layer: MinNode,
                argmax_layer: ArgMaxNode,
                argmin_layer: ArgMinNode,
                repeat_layer: RepeatNode,
            };
        })(),
    },
    tensor_shape: {
        label: "Tensor Shape",
        nodes: { reshape_layer: ReshapeNode, transpose_layer: TransposeNode, flatten_layer: FlattenNode },
    },
    tensor_create: {
        label: "Tensor Creation",
        nodes: { zeros_layer: ZerosNode, ones_layer: OnesNode, rand_layer: RandNode },
    },
    activations: {
        label: "Activations",
        nodes: {
            relu_layer: ReLUNode,
            leakyrelu_layer: LeakyReLUNode,
            gelu_layer: GELUNode,
            elu_layer: ELUNode,
            selu_layer: SELUNode,
            tanh_layer: TanhNode,
            sigmoid_layer: SigmoidNode,
            softplus_layer: SoftplusNode,
            softsign_layer: SoftsignNode,
            hardswish_layer: HardSwishNode,
            hardsigmoid_layer: HardSigmoidNode,
            softmax_layer: SoftmaxNode,
            logsoftmax_layer: LogSoftmaxNode,
        },
    },
    normalization: {
        label: "Normalization",
        nodes: {
            batchnorm2d_layer: BatchNorm2dNode,
            instancenorm2d_layer: InstanceNorm2dNode,
            groupnorm_layer: GroupNormNode,
            layernorm_layer: LayerNormNode,
            rmsnorm_layer: RMSNormNode,
        },
    },
    regularization: {
        label: "Regularization",
        nodes: {
            dropout_layer: DropoutNode,
            spatialdropout2d_layer: SpatialDropout2dNode,
            alphadropout_layer: AlphaDropoutNode,
            stochasticdepth_layer: StochasticDepthNode,
        },
    },
    dense: {
        label: "Linear / Dense",
        nodes: { linear_layer: LinearLayerNode },
    },
    vision_conv: {
        label: "Vision - Convolution",
        nodes: {
            conv1d_layer: Conv1dNode,
            conv2d_layer: Conv2dNode,
            conv3d_layer: Conv3dNode,
            depthwiseconv2d_layer: DepthwiseConv2dNode,
            pointwiseconv2d_layer: PointwiseConv2dNode,
            convtranspose2d_layer: ConvTranspose2dNode,
            upsample_layer: UpsampleNode,
            residual_block: ResidualBlockNode,
        },
    },
    vision_pool: {
        label: "Vision - Pooling",
        nodes: {
            maxpool1d_layer: MaxPool1dNode,
            maxpool2d_layer: MaxPool2dNode,
            maxpool3d_layer: MaxPool3dNode,
            avgpool1d_layer: AvgPool1dNode,
            avgpool2d_layer: AvgPool2dNode,
            avgpool3d_layer: AvgPool3dNode,
            adaptiveavgpool2d_layer: AdaptiveAvgPool2dNode,
            adaptivemaxpool2d_layer: AdaptiveMaxPool2dNode,
            globalavgpool2d_layer: GlobalAvgPool2dNode,
            globalmaxpool2d_layer: GlobalMaxPool2dNode,
        },
    },
    sequence: {
        label: "Sequence / Attention",
        nodes: {
            embedding_layer: EmbeddingNode,
            rnn_layer: RNNNode,
            lstm_layer: LSTMNode,
            gru_layer: GRUNode,
            multihead_attention_layer: MultiheadAttentionNode,
            positional_encoding_layer: PositionalEncodingNode,
        },
    },
    losses: {
        label: "Losses",
        nodes: {
            mse_loss: MSELossNode,
            cross_entropy_loss: CrossEntropyLossNode,
            bce_loss: BCELossNode,
        },
    },
    metrics: {
        label: "Metrics",
        nodes: {
            accuracy_metric: AccuracyNode,
        },
    },
    control: {
        label: "Control Flow",
        nodes: {
            repeat_layer: RepeatLayerNode,
        },
    },
};

Object.values(NODE_GROUPS).forEach(group => {
    Object.entries(group.nodes).forEach(([key, Class]) => {
        registerLayer(key, Class as LayerDefinition<any>);
    });
});

// 2. Register Special Nodes (like ModuleRef)
registerLayer("module_ref", ModuleRefNode);

// 3. Re-export the populated registry for convenience
console.log(LAYER_REGISTRY);
export { LAYER_REGISTRY };
