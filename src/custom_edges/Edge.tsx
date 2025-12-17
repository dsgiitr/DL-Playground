import {
  getBezierPath,
  BaseEdge,
  type EdgeProps,
  type Edge,
  EdgeLabelRenderer,
  useReactFlow,
} from "@xyflow/react";
import { LAYER_REGISTRY } from "../types/nodeTypes";

type CustomEdgeData = {
  label: string;
  shape: number[];
  error?: string;
  highlight?: boolean;
  // Optional callback to remove this edge from parent state (preferred over internal store updates).
  onDelete?: (id: string) => void;
};
type CustomEdge = Edge<CustomEdgeData, "custom">;

export default function CustomEdge(props: EdgeProps<CustomEdge>) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  } = props;
  
  // Access sourceHandle and targetHandle from the full props object
  // React Flow stores these but EdgeProps type definition might not expose them
  const fullEdge = props as any;
  const sourceHandle = fullEdge.sourceHandle || (fullEdge.data as any)?.sourceHandle;
  const targetHandle = fullEdge.targetHandle || (fullEdge.data as any)?.targetHandle;
  
  // Parse from edge ID as fallback if still undefined
  // Edge IDs follow pattern: xy-edge__node-10conv_out-node-11in-0
  let finalSourceHandle = sourceHandle;
  if (!finalSourceHandle && id.includes('__')) {
    const parts = id.split('__')[1]?.split('-');
    if (parts && parts.length >= 3) {
      // parts: ["node", "10conv_out", "node", ...]
      // Extract everything after "node-XX"
      const sourceNodePart = parts.slice(0, 2).join('-'); // "node-10conv_out"
      const handleMatch = sourceNodePart.match(/node-\d+(.+)/);
      if (handleMatch && handleMatch[1]) {
        finalSourceHandle = handleMatch[1]; // "conv_out"
      }
    }
  }
  
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const stroke = data?.highlight
    ? "#f1c40f"
    : data?.error
    ? "#ff6b6b"
    : undefined;
  const strokeWidth = data?.highlight ? 3.5 : 2;
  const { setEdges, setNodes, getNode } = useReactFlow();
  
  // Read label from source node's handle labels or HandleSchema
  const sourceNode = getNode(source);
  const handleLabels = (sourceNode?.data?.__handleLabels as Record<string, string> | undefined) || {};
  const handleId = finalSourceHandle || 'out';
  
  // Try to get custom label first, then defaultLabel from HandleSchema, finally fallback to handleId
  let label = handleLabels[handleId];
  
  if (!label || !label.trim()) {
    // Try to get defaultLabel from HandleSchema
    const nodeType = sourceNode?.type;
    if (nodeType && LAYER_REGISTRY[nodeType]) {
      const layerDef = LAYER_REGISTRY[nodeType];
      const handleSchema = typeof layerDef.handleSchema === 'function'
        ? layerDef.handleSchema(sourceNode.data)
        : layerDef.handleSchema;
      
      if (handleSchema) {
        const handleDef = handleSchema.outputs.find(h => h.id === handleId);
        label = handleDef?.defaultLabel || handleId;
      } else {
        label = handleId;
      }
    } else {
      label = handleId;
    }
  }

  const onLabelChange = (newLabel: string) => {
    // Update the source node's handle label (affects all edges from this handle)
    setNodes((nodes) =>
      nodes.map((n) =>
        n.id === source
          ? {
              ...n,
              data: {
                ...n.data,
                __handleLabels: {
                  ...(n.data?.__handleLabels || {}),
                  [handleId]: newLabel,
                },
              },
            }
          : n
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
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
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
      <BaseEdge
        id={id}
        path={edgePath}
        style={stroke ? { stroke, strokeWidth } : undefined}
      />
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
            border: "1px solid #223",
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
              width: 70,
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
              lineHeight: "16px",
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
