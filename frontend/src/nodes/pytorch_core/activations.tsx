import { makeUnaryActivation } from "./UnaryActivationNode";

const identity = (expr: string) => expr;

export const ReLUNode = makeUnaryActivation("ReLU", "nn.ReLU()", identity);
export const LeakyReLUNode = makeUnaryActivation("LeakyReLU", "nn.LeakyReLU()", identity);
export const GELUNode = makeUnaryActivation("GELU", "nn.GELU()", identity);
export const ELUNode = makeUnaryActivation("ELU", "nn.ELU()", identity);
export const SELUNode = makeUnaryActivation("SELU", "nn.SELU()", identity);
export const TanhNode = makeUnaryActivation("Tanh", "nn.Tanh()", identity);
export const SigmoidNode = makeUnaryActivation("Sigmoid", "nn.Sigmoid()", identity);
export const SoftplusNode = makeUnaryActivation("Softplus", "nn.Softplus()", identity);
export const SoftsignNode = makeUnaryActivation("Softsign", "nn.Softsign()", identity);
export const HardSwishNode = makeUnaryActivation("HardSwish", "nn.Hardswish()", identity);
export const HardSigmoidNode = makeUnaryActivation("HardSigmoid", "nn.Hardsigmoid()", identity);
