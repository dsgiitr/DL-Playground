export type GraphPortKind = "input" | "output" | "other";

export interface GraphPort {
    id: string;
    kind: GraphPortKind;
    order: number;
}

export interface GraphDisplay {
    title: string;
    params?: string;
    shape?: string;
}

export interface GraphNode {
    id: string;
    type: string;
    label?: string;
    display?: GraphDisplay;
    ports: GraphPort[];
    position?: { x: number; y: number };
    data?: Record<string, unknown>;
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    sourcePort: string;
    targetPort: string;
    kind?: "data" | "skip" | "control";
    data?: Record<string, unknown>;
}

export interface GraphIR {
    version: number;
    createdAt: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
}
