import { getBezierPath, BaseEdge, type EdgeProps, type Edge, EdgeLabelRenderer, useReactFlow } from "@xyflow/react";

type CustomEdgeData = {
    label: string,
    shape: number[],
    error?: string
}
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
    const stroke = data?.error ? "#ff6b6b" : undefined;
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
            <BaseEdge id={id} path={edgePath} style={stroke ? { stroke, strokeWidth: 2 } : undefined} />
            {data?.error && <title>{data.error}</title>}
            <EdgeLabelRenderer>
                <input
                style={{
                    position: 'absolute',
                    transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                    background: '#0099ff60',
                    padding: 2,
                    borderRadius: 5,
                    fontSize: 8,
                    fontWeight: 600,
                    pointerEvents: "all"
                }}
                className="nodrag nopan"
                onChange={(e) => onLabelChange(e.target.value)}
                value={label}/
                >
            </EdgeLabelRenderer>
        </g>
    );
}

