import { getBezierPath, BaseEdge, type EdgeProps, type Edge, EdgeLabelRenderer, useReactFlow } from '@xyflow/react';
import {useState} from 'react'
 
type CustomEdgeData = {
  label: string;
  shape: number[]
};

type CustomEdge = Edge<CustomEdgeData, 'custom'>;
 
export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data
}: EdgeProps<CustomEdge>) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  const edgeParams = data;

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
    <>
    <BaseEdge id={id} path={edgePath} />
    <EdgeLabelRenderer>
          <input
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            background: '#0099ff60',
            padding: 4,
            borderRadius: 5,
            fontSize: 8,
            fontWeight: 700,
            pointerEvents: "all"
          }}
          className="nodrag nopan"
          onChange={(e) => onLabelChange(e.target.value)}
          value={label}/
          >
    </EdgeLabelRenderer>
    </>
  );
}