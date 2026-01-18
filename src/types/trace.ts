export interface TraceRequest {
    graph: unknown; // GraphIR snapshot sent to backend
    inputShapes: Array<number[]>; // e.g., [[1, 3, 224, 224]]
    code?: string; // optional generated PyTorch code (frontend codegen)
}

export interface TraceEntry {
    id: string;
    scope: string;
    op: string;
    inputShape?: string;
    outputShape?: string;
    dtype?: string;
    stats?: {
        min?: number;
        max?: number;
        mean?: number;
    };
    nodeIds?: string[]; // GraphIR node ids mapped to this op
}

export interface TraceResponse {
    entries: TraceEntry[];
    warnings?: string[];
    svgBase64?: string;
    summaryText?: string;
}
