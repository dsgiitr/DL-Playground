import React, { useEffect, useMemo, useState } from "react";
import { type FieldSpec, type FieldType, type LayerData } from "../../node_gen/BaseClass";
// import { createLayerComponent } from "../../node_gen/CreateNodeComponent.tsx";
import { Handle, NodeResizeControl, Position, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { compileGraphToScript } from "../../utils/codeCompile";
import { estimateGraphCost } from "../../utils/computeEstimator";
import { verifyShapes } from "../../utils/shape_verifier";

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
    static shapeVerifier(data: RepeatLayerData, inputShapes: number[][], registry?: Record<string, any>) {
        // 1. SAFETY: Handle uninitialized data (Fixes the "New Node" crash)
        const safeData = data || { internalNodes: [], internalEdges: [] };

        // 2. SAFETY: Handle empty internal nodes (Fast exit)
        if (!safeData.internalNodes || safeData.internalNodes.length === 0) {
            return { ok: true as const };
        }

        // 3. CHECK: Registry must be present
        if (!registry) {
            return { ok: false as const, error: "System Error: Registry not passed to RepeatLayer verifier." };
        }

        // 4. CHECK: Inputs required
        if (!inputShapes || inputShapes.length === 0) {
            return { ok: false as const, error: "Repeat Layer requires an input to loop over." };
        }

        const loopInputShape = inputShapes[0];

        // 5. Logic: Mock Environment
        const internalIds = new Set(safeData.internalNodes.map(n => n.id));
        const edgesToCheck = (safeData.internalEdges || []).map(e => ({ ...e }));

        const inputEdges = edgesToCheck.filter(e => !internalIds.has(e.source));
        const outputEdges = edgesToCheck.filter(e => !internalIds.has(e.target));

        if (inputEdges.length === 0) return { ok: false as const, error: "Internal graph disconnected from Loop Start." };
        if (outputEdges.length === 0) return { ok: false as const, error: "Internal graph disconnected from Loop End." };

        const MOCK_INPUT_ID = "__LOOP_ENTRY__";

        // Ensure InputNode compatible format
        const mockDims = loopInputShape.map((size, idx) => ({
            label: `D${idx}`,
            size: size.toString(),
            type: "inferred"
        }));

        const mockInputNode: Node = {
            id: MOCK_INPUT_ID,
            type: "input_layer", // Ensure "input_layer" is in your registry!
            position: { x: 0, y: 0 },
            data: {
                label: "Loop Start",
                dims: mockDims
            }
        }

        inputEdges.forEach(e => { e.source = MOCK_INPUT_ID; });

        const nodesToVerify = [...safeData.internalNodes, mockInputNode];
        const edgesToVerify = edgesToCheck.filter(e =>
            (internalIds.has(e.source) || e.source === MOCK_INPUT_ID) &&
            internalIds.has(e.target)
        );

        // Recursive call
        const result = verifyShapes(nodesToVerify, edgesToVerify, registry);

        if (!result.ok) {
            const firstFail = result.failures[0];
            return {
                ok: false as const,
                error: `Internal Error (${firstFail.label || firstFail.nodeId}): ${firstFail.error}`
            }
        }

        // 6. Logic: Loop Consistency
        for (const outEdge of outputEdges) {
            const sourceNodeId = outEdge.source;
            const sourceShape = result.shapes[sourceNodeId]?.defaultShape;

            if (!sourceShape) {
                return { ok: false as const, error: `Could not determine shape for output ${sourceNodeId}` };
            }

            const shapesMatch = sourceShape.length === loopInputShape.length &&
                sourceShape.every((v, i) => v === loopInputShape[i]);

            if (!shapesMatch) {
                return {
                    ok: false as const,
                    error: `Shape Mismatch: Loop Start is [${loopInputShape}], but Loop End receives [${sourceShape}]. They must match.`
                };
            }
        }

        return { ok: true as const };
    }
    static shapeCompute(_data: RepeatLayerData, inputShapes: number[][]) {
        //Since the shape is constant for now, pass through the shape. 
        console.log("shape compute ran")
        if (!inputShapes || inputShapes.length === 0 || !inputShapes[0]) {
            return [[]]
        }
        return inputShapes[0];
    }

    static estimateCost(data: RepeatLayerData, inputShapes: number[][], _outputShape: number[], context?: { registry?: Record<string, any> }) {
        const registry = context?.registry;
        if (!registry) return { params: 0, flops: 0 };
        if (!data?.internalNodes?.length) return { params: 0, flops: 0 };
        const loopInputShape = inputShapes[0];
        if (!loopInputShape?.length) return { params: 0, flops: 0 };

        const internalIds = new Set(data.internalNodes.map(n => n.id));
        const edgesToCheck = (data.internalEdges || []).map(e => ({ ...e }));
        const inputEdges = edgesToCheck.filter(e => !internalIds.has(e.source));
        if (inputEdges.length === 0) return { params: 0, flops: 0 };

        const MOCK_INPUT_ID = "__LOOP_ENTRY__";
        const mockDims = loopInputShape.map((size, idx) => ({
            label: `D${idx}`,
            size: size.toString(),
            type: "inferred"
        }));
        const mockInputNode: Node = {
            id: MOCK_INPUT_ID,
            type: "input_layer",
            position: { x: 0, y: 0 },
            data: { label: "Loop Start", dims: mockDims }
        };

        inputEdges.forEach(e => {
            e.source = MOCK_INPUT_ID;
        });

        const nodesToVerify = [...data.internalNodes, mockInputNode];
        const edgesToVerify = edgesToCheck.filter(e =>
            (internalIds.has(e.source) || e.source === MOCK_INPUT_ID) &&
            internalIds.has(e.target)
        );

        const shapeResult = verifyShapes(nodesToVerify, edgesToVerify, registry);
        if (!shapeResult.ok) return { params: 0, flops: 0 };

        const internalCost = estimateGraphCost(data.internalNodes, edgesToVerify, shapeResult, registry);
        const repetitions = Math.max(1, data.repetitions || 1);
        return {
            params: internalCost.totalParams,
            flops: internalCost.totalFlops * repetitions
        };
    }

    static getInitCode(data: RepeatLayerData, name: string) {
        if (!data.internalNodes || data.internalNodes.length === 0) {
            return `#Empty Loop`;
        }
        const { initLines } = compileGraphToScript(
            data.internalNodes,
            data.internalEdges
        );
        if (!initLines || initLines.length === 0) {
            return `pass # Loop contains no trainable layers`;
        }
        return initLines.map(l => l.text.trim()).join("\n        ")
    }
    static getForwardCode(data: RepeatLayerData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";
        const N = data.repetitions || 1;
        if (!data.internalNodes || data.internalNodes.length === 0) {
            return `${outputVar} = ${inputVar} # Empty Loop`;
        }
        const startEdges = data.internalEdges.filter(e => e.sourceHandle === 'in-internal')
        const stateInjection = startEdges.map(e => {
            const varName = e.data?.label as string || "x";
            const cleanName = varName.replace(/-/g, '_')
            return `${cleanName} = _loop_state`;
        }).join("\n            ")
        const injectionCode = stateInjection.length > 0 ? stateInjection : `x = _loop_state`
        const { forwardLines, returnVar: defaultReturn } = compileGraphToScript(
            data.internalNodes,
            data.internalEdges,
            ``
        )
        const endEdge = data.internalEdges.find(e => e.targetHandle === 'out-internal')
        let returnVar = defaultReturn;
        if (endEdge && endEdge.data?.label) {
            const label = endEdge.data?.label as string || 'out-internal';
            returnVar = label.replace(/-/g, '_')
        }
        console.log(forwardLines)
        console.log(returnVar)
        const loopBody = forwardLines?.map(l => `    ${l.text.trim()}`).join("\n        ");
        return `
        # Repeat Block (${N} iterations)
        _loop_state = ${inputVar}
        for _ in range(${N}):
            # Inject state into subgraph input
            ${injectionCode}
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

        const DEFAULT_W = 400;
        const DEFAULT_H = 300;
        useEffect(() => {
            if (!width || !height) {
                setNodes((nodes) =>
                    nodes.map((n) => {
                        if (n.id === id) {
                            return {
                                ...n,
                                zIndex: -1,
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
        const onChange = (key: string, type: FieldType) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            let newValue: any = e.target.value;
            if (type === "number") {
                newValue = newValue === "" ? undefined : parseFloat(newValue);
            }
            setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, [key]: newValue } } : n));

        };
        const handleDelete = (e: React.MouseEvent) => {
            // e.stopPropagation();
            setNodes(nodes => nodes.filter(n => n.id !== id))
            setEdges(eds => eds.filter(edge => edge.source !== id && edge.target !== id));
        }
        const renderWidth = width ?? DEFAULT_W;
        const renderHeight = height ?? DEFAULT_H;
        const { requiredParams, optionalParams } = useMemo(() => {
            const keys = Object.keys(paramSchema);
            const req = keys.filter(k => paramSchema[k].required);
            const opt = keys.filter(k => !paramSchema[k].required);
            return { requiredParams: req, optionalParams: opt };
        }, []);

        const accentColor = selected ? "#f1c40f" : "#555";
        const handleSize = 14;
        const baseHandleStyle = { width: handleSize, height: handleSize, zIndex: 50, border: `2px solid #1a1a1a` };

        const paramsToShow = new Set(requiredParams);
        optionalParams.forEach(key => {
            if (isExpanded || safeData[key] !== undefined) {
                paramsToShow.add(key);
            }
        });

        function ResizeBracket({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
            const baseStyle: React.CSSProperties = {
                background: 'transparent',
                border: 'none',
                width: 16,
                height: 16,
                position: 'absolute',
                transition: 'none',
                pointerEvents: 'all'
            }
            const variantStyle: React.CSSProperties = (() => {
                const color = '#f1c40f';
                const borderThick = '3px solid ' + color;
                const offset = -2;

                switch (position) {
                    case 'top-left':
                        return {
                            borderTop: borderThick, borderLeft: borderThick,
                            top: offset, left: offset
                        };
                    case 'top-right':
                        return {
                            borderTop: borderThick, borderRight: borderThick,
                            top: offset, right: offset
                        };
                    case 'bottom-left':
                        return {
                            borderBottom: borderThick, borderLeft: borderThick,
                            bottom: offset, left: offset
                        };
                    case 'bottom-right':
                        return {
                            borderBottom: borderThick, borderRight: borderThick,
                            bottom: offset, right: offset
                        };
                    default:
                        return {};
                }
            })();
            return (
                <NodeResizeControl
                    minWidth={350}
                    minHeight={200}
                    position={position}
                    style={{ ...baseStyle, ...variantStyle }}
                />
            )
        }
        return (
            <>
                {selected && (
                    <>
                        <ResizeBracket position="top-left" />
                        <ResizeBracket position="top-right" />
                        <ResizeBracket position="bottom-left" />
                        <ResizeBracket position="bottom-right" />
                    </>
                )}

                {/* --- MAIN CONTAINER --- */}
                <div
                    style={{
                        width: `${renderWidth}px`,
                        height: `${renderHeight}px`,
                        backgroundColor: "rgba(20, 20, 25, 0.85)",
                        backdropFilter: "blur(8px)",
                        border: `2px solid ${accentColor}`,
                        borderRadius: "16px",
                        boxShadow: selected ? "0 10px 40px rgba(100, 255, 218, 0.1)" : "0 4px 12px rgba(0,0,0,0.4)",
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        transition: "all 0.1s ease-in-out",
                    }}
                >
                    {/* Header */}
                    <div style={{
                        height: '40px',
                        background: selected ? 'rgba(100, 255, 218, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                        borderBottom: `1px solid ${selected ? 'rgba(100, 255, 218, 0.2)' : 'rgba(255, 255, 255, 0.05)'}`,
                        display: 'flex', alignItems: 'center', padding: '0 12px', justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={selected ? "#64ffda" : "#aaa"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m2.9 5.7L3 12l2.9-5.7" />
                            </svg>
                            <span style={{ fontWeight: 700, color: '#eee', fontSize: '12px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                Repeat Block
                            </span>
                            {childCount > 0 && (
                                <span style={{ fontSize: '10px', background: '#64ffda', color: '#0b0d10', fontWeight: 800, padding: '2px 8px', borderRadius: '12px' }}>
                                    {childCount} Nodes
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>ITERATIONS</span>
                            <input
                                type="number"
                                className="nodrag"
                                value={safeData['repetitions'] || 1}
                                onChange={onChange('repetitions', 'number')}
                                style={{ width: '44px', fontSize: '12px', textAlign: 'center', fontWeight: 'bold', background: '#0b0d10', border: '1px solid #444', color: '#64ffda', borderRadius: 6, padding: '4px 0' }}
                            />
                            <button onClick={handleDelete} className="nodrag" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff5555', fontSize: '18px', display: 'flex', alignItems: 'center' }}>×</button>
                        </div>
                    </div>

                    {/* Content Area & Labels */}
                    <div style={{ flex: 1, position: 'relative' }}>
                        {/* Internal Labels */}
                        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-25%)' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#64ffda', opacity: 0.8, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                START
                            </span>
                        </div>
                        <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-25%)' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#64ffda', opacity: 0.8, writingMode: 'vertical-rl' }}>
                                END
                            </span>
                        </div>
                        {childCount === 0 && (
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                color: 'rgba(255,255,255,0.1)', fontSize: '14px', fontWeight: 600, pointerEvents: 'none',
                                textAlign: 'center', border: '2px dashed rgba(255,255,255,0.1)', padding: '20px', borderRadius: '12px'
                            }}>
                                DROP NODES HERE
                            </div>
                        )}
                    </div>
                </div>

                {/* --- HANDLES --- */}
                {/* NOTE ON FIX: 
                    When placing a handle on the opposite side of its natural 'Position', 
                    we MUST set the default side to 'auto' to override React Flow's CSS.
                    e.g. Position.Left adds 'left: 0'. We must set 'left: auto' if we want it on the right.
                */}

                {/* 1. EXTERNAL INPUT (Left Edge) */}
                <Handle
                    type='target'
                    position={Position.Left}
                    id="in-external"
                    style={{ ...baseHandleStyle, background: '#fff', left: -9 }}
                    isConnectable={isConnectable}
                />

                {/* 2. INTERNAL START (Left Inner) */}
                {/* Position.Right -> Default is Right Edge. We override to Left. */}
                <Handle
                    type='source'
                    position={Position.Right}
                    id='in-internal'
                    style={{
                        ...baseHandleStyle, background: '#64ffda', borderRadius: '4px',
                        left: 4,        // Force to Left Side
                        right: 'auto',   // Release from Right Side
                        top: '50%'
                    }}
                    isConnectable={isConnectable}
                />

                {/* 3. INTERNAL END (Right Inner) */}
                {/* Position.Left -> Default is Left Edge. We override to Right. */}
                <Handle
                    type="target"
                    position={Position.Left}
                    id="out-internal"
                    style={{
                        ...baseHandleStyle, background: '#64ffda', borderRadius: '4px',
                        right: 4,       // Force to Right Side
                        left: 'auto',    // Release from Left Side (THE FIX)
                        top: '50%'
                    }}
                    isConnectable={isConnectable}
                />

                {/* 4. EXTERNAL OUTPUT (Right Edge) */}
                <Handle
                    type="source"
                    position={Position.Right}
                    id="out-external"
                    style={{ ...baseHandleStyle, background: '#fff', right: -9 }}
                    isConnectable={isConnectable}
                />
            </>
        )
    };
}
