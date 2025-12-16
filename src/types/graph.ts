// Handle kinds are explicit; we no longer infer input/output from edge direction alone.
export type GraphHandleKind = "input" | "output" | "other";

export interface GraphHandle {
    id: string; // stable handle id on the node
    kind: GraphHandleKind;
    // order preserves positional meaning (e.g., arg0/arg1) after the recent convention shift.
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
    handles: GraphHandle[];
    position?: { x: number; y: number };
    data?: Record<string, unknown>;
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    // Handles must reference GraphHandle ids on the respective nodes; directional convention is now explicit.
    sourceHandle: string;
    targetHandle: string;
    kind?: "data" | "skip" | "control";
    data?: Record<string, unknown>;
}

export interface GraphIR {
    // Versioned snapshot of the diagram (IDs/handles/positions) after the convention change.
    version: number;
    createdAt: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
}
