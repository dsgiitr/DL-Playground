import { getStraightPath, BaseEdge, type EdgeProps, type Edge } from '@xyflow/react';

type CustomEdge = Edge<{ error?: string }, 'custom'>;

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<CustomEdge>) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const stroke = data?.error ? '#ff6b6b' : undefined;

  return (
    <g>
      {/* Larger invisible hit area to make tooltip/hover easier */}
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
