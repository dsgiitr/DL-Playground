import {
  getBezierPath,
  BaseEdge,
  type EdgeProps,
  type Edge,
  EdgeLabelRenderer,
  useReactFlow,
} from "@xyflow/react";
import { useState } from "react";
import { LAYER_REGISTRY } from "../types/nodeTypes";

type CustomEdgeData = {
  label: string;
  shape: number[];
  error?: string;
  highlight?: boolean;
  // Optional callback to remove this edge from parent state (preferred over internal store updates).
  onDelete?: (id: string) => void;
  // Handle IDs for source and target
  sourceHandle?: string;
  targetHandle?: string;
  // Per-edge label for variable naming in code (overrides default)
  edgeLabel?: string;
};
type CustomEdge = Edge<CustomEdgeData, "custom">;

// Extend EdgeProps to include handle IDs which are passed by React Flow
// but might be missing from the strict type definition in some versions
interface ExtendedEdgeProps extends EdgeProps<CustomEdge> {
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
}

export default function CustomEdge(props: ExtendedEdgeProps) {
  const {
    id,
    source,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    sourceHandleId,
    targetHandleId,
  } = props;

  // Access sourceHandle and targetHandle from props (preferred) or edge data (fallback)
  const sourceHandle = sourceHandleId || data?.sourceHandle;
=======
}: EdgeProps<CustomEdge>) {
    const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
    const stroke = data?.highlight ? "#f1c40f" : data?.error ? "#ff6b6b" : undefined;
    const strokeWidth = data?.highlight ? 3.5 : 2;
    const { setEdges } = useReactFlow();
    const label = data?.label ?? id;
    const [isHovered, setIsHovered] = useState(false);
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
>>>>>>> b0a3a31f319e6c29b9c50b2e83868152b738ef03

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
  const { setEdges, getNode } = useReactFlow();

  // Get handle's default label from HandleSchema
  const sourceNode = getNode(source);
  const handleId = sourceHandle || "out";

  let handleDefaultLabel = handleId;
  const nodeType = sourceNode?.type;
  if (nodeType && LAYER_REGISTRY[nodeType]) {
    const layerDef = LAYER_REGISTRY[nodeType];
    const handleSchema =
      typeof layerDef.handleSchema === "function"
        ? layerDef.handleSchema(sourceNode.data)
        : layerDef.handleSchema;

    if (handleSchema) {
      const handleDef = handleSchema.outputs.find((h) => h.id === handleId);
      handleDefaultLabel = handleDef?.defaultLabel || handleId;
    }
  }

  // Edge label is either the custom per-edge label or auto-generated from handle
  const edgeLabel = data?.edgeLabel || handleDefaultLabel;

  const label = data?.label ?? id;
  const [isHovered, setIsHovered] = useState(false);

  const onLabelChange = (newLabel: string) => {
    // Update this edge's label (does not affect other edges from the same handle)
    setEdges((edges) =>
      edges.map((e) =>
        e.id === id
          ? {
              ...e,
              data: {
                ...e.data,
                edgeLabel: newLabel,
              },
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
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            pointerEvents: "all",
            background: "#0d1b2a",
            padding: "4px 6px",
            borderRadius: 6,
            border: "1px solid #223",
          }}
          className="nodrag nopan"
        >
          {/* Handle label (readonly, shows internal naming) */}
          <div
            style={{
              fontSize: 7,
              color: "#999",
              fontStyle: "italic",
              marginBottom: 2,
            }}
            title="Handle output name (from node definition)"
          >
            {handleDefaultLabel}
          </div>

          {/* Edge label (editable, shows code variable name) */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
              value={edgeLabel}
              placeholder="var name"
              title="Variable name in generated code"
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
        </div>
      </EdgeLabelRenderer>
    </g>
  );
}
