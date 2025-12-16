import { getBezierPath, BaseEdge, type EdgeProps, type Edge, EdgeLabelRenderer, useReactFlow } from "@xyflow/react";

type CustomEdgeData = {
    label: string;
    shape: number[];
    error?: string;
    highlight?: boolean;
    // Optional callback to remove this edge from parent state (preferred over internal store updates).
    onDelete?: (id: string) => void;
};
type CustomEdge = Edge<CustomEdgeData, "custom">;

export default function CustomEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
}: EdgeProps<CustomEdge>) {
    const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
    const stroke = data?.highlight ? "#f1c40f" : data?.error ? "#ff6b6b" : undefined;
    const strokeWidth = data?.highlight ? 3.5 : 2;
    const { setEdges } = useReactFlow();
    const label = data?.label ?? id;

    const onLabelChange = (newLabel: string) => {
        setEdges(edges =>
        edges.map(e =>
            e.id === id
            ? {
                ...e,
                data: {
                    ...e.data,
                    label: newLabel
                }
                }
            : e
        )
        );
    };

    const onDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (typeof data?.onDelete === "function") {
            data.onDelete(id);
            return;
        }
        // Fallback for environments that rely on the internal store.
        setEdges(edges => edges.filter(edge => edge.id !== id));
    };

    return (
        <g>
            <path
                d={edgePath}
                stroke="transparent"
                strokeWidth={12}
                fill="none"
                pointerEvents="stroke"
            >
                {data?.error && <title>{data.error}</title>}
            </path>
            {data?.highlight && (
                <path
                    d={edgePath}
                    stroke="#f1c40f55"
                    strokeWidth={10}
                    fill="none"
                    pointerEvents="none"
                />
            )}
            <BaseEdge id={id} path={edgePath} style={stroke ? { stroke, strokeWidth } : undefined} />
            {data?.error && <title>{data.error}</title>}
            <EdgeLabelRenderer>
                <div
                    style={{
                        position: "absolute",
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        pointerEvents: "all",
                        background: "#0d1b2a",
                        padding: "2px 4px",
                        borderRadius: 6,
                        border: "1px solid #223"
                    }}
                    className="nodrag nopan"
                >
                    <input
                        style={{
                            background: "#0099ff60",
                            padding: "2px 4px",
                            borderRadius: 5,
                            fontSize: 8,
                            fontWeight: 600,
                            border: "none",
                            color: "#fff",
                            width: 70
                        }}
                        className="nodrag nopan"
                        onChange={(e) => onLabelChange(e.target.value)}
                        value={label}
                    />
                    <button
                        onClick={onDelete}
                        style={{
                            cursor: "pointer",
                            border: "none",
                            background: "#d9534f",
                            color: "#fff",
                            borderRadius: 4,
                            padding: "0 6px",
                            fontSize: 10,
                            lineHeight: "16px"
                        }}
                        title="Delete edge"
                        aria-label="Delete edge"
                        className="nodrag nopan"
                    >
                        ✕
                    </button>
                </div>
            </EdgeLabelRenderer>
        </g>
    );
}
