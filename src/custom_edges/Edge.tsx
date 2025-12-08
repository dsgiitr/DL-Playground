import { getBezierPath, BaseEdge, type EdgeProps, type Edge, EdgeLabelRenderer } from '@xyflow/react';
import {useState} from 'react'
 
type CustomEdge = Edge<{ value: number }, 'custom'>;
 
export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data
}: EdgeProps<CustomEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  const edgeParams = data;
  const [label, setLabel] = useState(id);

  const onLabelChange = (newLabel: string) => {
    setLabel(newLabel);
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