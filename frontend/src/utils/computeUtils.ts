export const shapeProduct = (dims: number[]) => dims.reduce((acc, v) => acc * v, 1);

export const toNumber = (value: unknown, fallback = 0) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const estimateConvCost = (
    outputShape: number[],
    inChannels: number,
    outChannels: number,
    kernelVolume: number,
    includeBias: boolean,
    groups = 1
) => {
    const perFilter = (inChannels / groups) * kernelVolume;
    const params = outChannels * perFilter + (includeBias ? outChannels : 0);
    const outElems = outputShape.length ? shapeProduct(outputShape) : 0;
    const flops = outElems * perFilter * 2;
    return { params, flops };
};

export const estimateLinearCost = (outputShape: number[], inFeatures: number, outFeatures: number, includeBias: boolean) => {
    const params = inFeatures * outFeatures + (includeBias ? outFeatures : 0);
    const outElems = outputShape.length ? shapeProduct(outputShape) : 0;
    const flops = outElems * inFeatures * 2;
    return { params, flops };
};

export const estimateElementwiseCost = (outputShape: number[], opsPerElement = 1) => {
    const outElems = outputShape.length ? shapeProduct(outputShape) : 0;
    return { params: 0, flops: outElems * opsPerElement };
};

export const estimateReductionCost = (inputShape: number[], opsPerElement = 1) => {
    const inElems = inputShape.length ? shapeProduct(inputShape) : 0;
    return { params: 0, flops: inElems * opsPerElement };
};

export const estimateSoftmaxCost = (outputShape: number[], opsPerElement = 3) =>
    estimateElementwiseCost(outputShape, opsPerElement);

export const estimateMatMulCost = (left: number[], right: number[]) => {
    if (left.length < 2 || right.length < 2) return { params: 0, flops: 0 };
    const m = left[left.length - 2];
    const k = left[left.length - 1];
    const n = right[right.length - 1];
    const batch = left.slice(0, -2).reduce((acc, v) => acc * v, 1);
    const outElems = batch * m * n;
    const flops = outElems * k * 2;
    return { params: 0, flops };
};

export const estimatePoolCost = (outputShape: number[], kernelVolume: number) => {
    const outElems = outputShape.length ? shapeProduct(outputShape) : 0;
    return { params: 0, flops: outElems * kernelVolume };
};

export const estimateRecurrentCost = (
    inputShape: number[],
    inputSize: number,
    hiddenSize: number,
    numLayers: number,
    bidirectional: boolean,
    gateCount: number
) => {
    if (inputShape.length < 3) return { params: 0, flops: 0 };
    const [batch, seq] = inputShape;
    const directions = bidirectional ? 2 : 1;
    const layers = Math.max(1, numLayers || 1);
    let params = 0;
    let flops = 0;
    for (let layer = 0; layer < layers; layer += 1) {
        const layerInput = layer === 0 ? inputSize : hiddenSize * directions;
        const perDirParams = gateCount * (layerInput * hiddenSize + hiddenSize * hiddenSize + 2 * hiddenSize);
        params += directions * perDirParams;
        const perStep = gateCount * 2 * (layerInput * hiddenSize + hiddenSize * hiddenSize);
        flops += batch * seq * directions * perStep;
    }
    return { params, flops };
};

export const estimateAttentionCost = (inputShape: number[], embedDim: number, numHeads: number) => {
    if (inputShape.length < 3 || embedDim <= 0 || numHeads <= 0) return { params: 0, flops: 0 };
    const [batch, seq] = inputShape;
    const headDim = embedDim / numHeads;
    if (!Number.isFinite(headDim) || headDim <= 0) return { params: 0, flops: 0 };
    const qkvProj = 3 * batch * seq * embedDim * embedDim * 2;
    const outProj = batch * seq * embedDim * embedDim * 2;
    const scoreFlops = batch * numHeads * seq * seq * headDim * 2;
    const valueFlops = batch * numHeads * seq * seq * headDim * 2;
    const softmaxFlops = batch * numHeads * seq * seq * 3;
    const flops = qkvProj + outProj + scoreFlops + valueFlops + softmaxFlops;
    const params = 4 * embedDim * embedDim + 4 * embedDim;
    return { params, flops };
};
