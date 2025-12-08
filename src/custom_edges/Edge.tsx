import { getBezierPath, BaseEdge, type EdgeProps, type Edge } from "@xyflow/react";

type CustomEdge = Edge<{ error?: string }, "custom">;

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
    const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
    const stroke = data?.error ? "#ff6b6b" : undefined;

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
        </g>
    );
}
