import React, { useEffect, useMemo, useState } from "react";
import { type FieldSpec, type FieldType, type LayerData } from "../../node_gen/BaseClass";
// import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";
import { Handle, NodeResizer, Position, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { compileGraphToScript } from "../../utils/codeCompile";

type ResizableNodeProps = NodeProps<Node<LayerData>> & {
    width?: number;
    height?: number;
};


type RepeatLayerData = {
    repetitions: number;
    internalNodes: Node[];
    internalEdges: Edge[];
}
export class RepeatLayerNode {
    static label = "Repeat Layer";
    static paramSchema: Record<string, FieldSpec> = {
        repetitions: {
            required: true,
            type: 'number',
            label: 'Repetitions',
            defaultValue: 1,
            step: 1
        }
    }
    // TODO: run actual simulation through this 
    static shapeVerifier(data: RepeatLayerData, inputShapes: number[][]) {
        if (!inputShapes || inputShapes.length === 0) return { ok: false as const, error: "No input to loop" };
        if (!data.internalNodes || data.internalNodes.length === 0) return { ok: true as const };
        return { ok: true as const };
    }
    static shapeCompute(_data: RepeatLayerData, _inputShapes: number[][]) {
        //TODO: fill this up
        return [_inputShapes[0]];
    }
    static getInitCode(_data: RepeatLayerData, _name: string) {
        return `# No need to define for loop (or at most create a repeated block here)`
    }
    static getForwardCode(data: RepeatLayerData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        const N = data.repetitions || 1;
        if (!data.internalNodes || data.internalNodes.length === 0) {
            return `${outputVar} = ${inputVar} # Empty Loop`;
        }
        const { forwardLines, returnVar } = compileGraphToScript(
            data.internalNodes,
            data.internalEdges,
            `${name}_`
        )
        const loopBody = forwardLines?.map(l => `    ${l.text.trim()}`).join("\n        ");
        return `
        # Repeat Block (${N} iterations)
        _loop_state = ${inputVar}
        for _ in range(${N}):
            x = _loop_state # Inject state into subgraph input
        ${loopBody}
            _loop_state = ${returnVar} # Update state with subgraph output
        ${outputVar} = _loop_state
        `.trim();
    }
    static Component = createRepeatLayerComponent<RepeatLayerData>(RepeatLayerNode.label, RepeatLayerNode.paramSchema)

}


// Configure this to adapt to create subgraphs inside this
// - allow parenting of nodes inside this
// - adjust the sizing according to the sizes of the nodes inside
// - allow handle incremention 
// 
export function createRepeatLayerComponent<D extends LayerData>(
    label: string,
    paramSchema: Record<string, FieldSpec>,
) {
    return ({ id, data, isConnectable, selected, width, height }: ResizableNodeProps) => {
        const { setNodes, setEdges } = useReactFlow();
        const [isExpanded] = useState(true);
        const safeData = data || ({} as D);

        const childCount = (safeData as any).internalNodes?.length || 0;

        const DEFAULT_W = 300;
        const DEFAULT_H = 300;
        useEffect(() => {
            if (!width || !height) {
                setNodes((nodes) =>
                    nodes.map((n) => {
                        if (n.id === id) {
                            return {
                                ...n,
                                style: {
                                    ...n.style,
                                    width: DEFAULT_W,
                                    height: DEFAULT_H,
                                },
                            };
                        }
                        return n;
                    })
                )
            }
        }, [id, width, height, setNodes]);
        // const isHighlighted = !!(safeData as any).__highlight;
        const renderWidth = width ?? DEFAULT_W;
        const renderHeight = height ?? DEFAULT_H;
        const { requiredParams, optionalParams } = useMemo(() => {
            const keys = Object.keys(paramSchema);
            const req = keys.filter(k => paramSchema[k].required);
            const opt = keys.filter(k => !paramSchema[k].required);
            return { requiredParams: req, optionalParams: opt };
        }, []);

        const onChange = (key: string, type: FieldType) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            let newValue: any = e.target.value;
            if (type === "number") {
                newValue = newValue === "" ? undefined : parseFloat(newValue);
            }
            setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, [key]: newValue } } : n));

        };
        const handleStyle = { width: 10, height: 10, background: '#777' };

        const paramsToShow = new Set(requiredParams);
        optionalParams.forEach(key => {
            if (isExpanded || safeData[key] !== undefined) {
                paramsToShow.add(key);
            }
        });
        const handleDelete = (e: React.MouseEvent) => {
            // e.stopPropagation();
            setNodes(nodes => nodes.filter(n => n.id !== id))
            setEdges(eds => eds.filter(edge => edge.source !== id && edge.target !== id));
        }
        return (
            <>
                <NodeResizer
                    color="#64ffda" isVisible={selected} minWidth={200} minHeight={200} />
                <Handle
                    type='target'
                    position={Position.Left}
                    id="in-external"
                    style={{ ...handleStyle, left: -5, top: '50%' }}
                    isConnectable={isConnectable}
                />
                <Handle
                    type='source'
                    position={Position.Left}
                    id='in-internal'
                    style={{ ...handleStyle, left: 15, top: '50%', background: '#64ffda' }}
                    isConnectable={isConnectable}
                />
                <div
                    style={{
                        width: `${renderWidth}px`,
                        height: `${renderHeight}px`,
                        backgroundColor: "rgba(30, 30, 30, 0.6)", // Semi-transparent
                        border: selected ? "2px solid #64ffda" : "2px dashed #555",
                        borderRadius: "12px",
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        paddingTop: '30px', // Space for header
                    }}
                >
                    {/* Header Strip */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0,
                        height: '30px',
                        background: '#333',
                        borderBottom: '1px solid #555',
                        borderTopLeftRadius: '12px', borderTopRightRadius: '12px',
                        display: 'flex', alignItems: 'center', padding: '0 8px',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontWeight: 'bold', color: '#eee', fontSize: '12px' }}>{label}</span>
                            {/* CHILD COUNT BADGE */}
                            <span style={{
                                fontSize: '10px', background: childCount > 0 ? '#1f8ecd' : '#555',
                                color: '#fff', padding: '2px 6px', borderRadius: '10px'
                            }}>
                                {childCount} nodes
                            </span>
                        </div>
                        <span style={{ fontWeight: 'bold', color: '#eee', fontSize: '12px' }}>{label}</span>
                        <input
                            type="number"
                            className="nodrag"
                            value={safeData['repetitions'] || 1}
                            onChange={onChange('repetitions', 'number')}
                            style={{ width: '50px', fontSize: '11px', background: '#222', border: '1px solid #555', color: '#fff' }}
                        />
                        <button
                            className="nodrag"
                            onClick={handleDelete}
                            style={{
                                marginLeft: "8px",
                                cursor: "pointer",
                                border: "none",
                                background: "transparent",
                                color: "#888",
                                fontWeight: "bold",
                                fontSize: "18px",
                                lineHeight: "18px",
                                width: "24px",
                                height: "24px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center"
                            }}
                            aria-label="Delete node"
                            title="Delete node"
                        >
                            ×
                        </button>
                    </div>
                    {/* Content Area: Drag nodes here */}
                    <div style={{ flex: 1, position: 'relative' }}>
                        <span style={{
                            position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: '#ffffff33', pointerEvents: 'none', fontSize: '10px'
                        }}>
                            Drag nodes here
                        </span>
                    </div>
                </div>
                <Handle
                    type="target"
                    position={Position.Right}
                    id="out-internal"
                    style={{ ...handleStyle, right: 15, top: '50%', background: '#64ffda' }}
                    isConnectable={isConnectable}
                />

                {/* D. External Source (Sends result to outside world) */}
                <Handle
                    type="source"
                    position={Position.Right}
                    id="out-external"
                    style={{ ...handleStyle, right: -5, top: '50%' }}
                    isConnectable={isConnectable}
                />
            </>
        )
    };
}
