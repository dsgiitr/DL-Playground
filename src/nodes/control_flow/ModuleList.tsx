// TODO: create moduleList layer
// TODO: fix parenting logic for repeat layer 
// TODO: ensure modulelist doesnt recieve control flow type 
import React, { useEffect, useMemo, useState } from "react";
import { type FieldSpec, type FieldType, type LayerData } from "../../node_gen/BaseClass";
import { Handle, NodeResizeControl, Position, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { compileGraphToScript } from "../../utils/codeCompile";
import { verifyShapes } from "../../utils/shape_verifier";

// ==========================================
// 1. Data Types
// ==========================================

type ResizableNodeProps = NodeProps<Node<LayerData>> & {
    width?: number;
    height?: number;
};

type ModuleListData = {
    repetitions: number;
    internalNodes: Node[];
    internalEdges: Edge[];
}

// ==========================================
// 2. The Logic Class
// ==========================================

export class ModuleListNode {
    static label = "Module List (Stack)";
    static paramSchema: Record<string, FieldSpec> = {
        repetitions: {
            required: true,
            type: 'number',
            label: 'Stack Size',
            defaultValue: 2,
            step: 1
        }
    }

    // --- SHAPE VERIFIER (Double Pass Strategy) ---
    static shapeVerifier(data: ModuleListData, inputShapes: number[][], registry?: Record<string, any>) {
        const safeData = data || { internalNodes: [], internalEdges: [] };

        // 1. Basic Checks
        if (!safeData.internalNodes || safeData.internalNodes.length === 0) return { ok: true as const };
        if (!registry) return { ok: false as const, error: "System Error: Registry missing." };
        if (!inputShapes || inputShapes.length === 0) return { ok: false as const, error: "Input required for Stack." };

        const loopInputShape = inputShapes[0];

        // 2. Helper to run a verification pass
        const runPass = (inputShape: number[], passLabel: string) => {
            const MOCK_ID = `__STACK_ENTRY_${passLabel}__`;

            // Mock Input Node
            const mockDims = inputShape.map((size, idx) => ({
                label: `D${idx}`,
                size: size.toString(),
                type: "inferred"
            }));

            const mockInputNode: Node = {
                id: MOCK_ID,
                type: "input_layer",
                position: { x: 0, y: 0 },
                data: { label: `Iter ${passLabel} In`, dims: mockDims }
            };

            const internalIds = new Set(safeData.internalNodes.map(n => n.id));

            // Reroute edges starting from "in-internal" to our mock node
            const edgesToCheck = safeData.internalEdges.map(e => {
                if (!internalIds.has(e.source)) return { ...e, source: MOCK_ID };
                return e;
            });

            // Run verification
            const nodesToVerify = [...safeData.internalNodes, mockInputNode];
            const edgesToVerify = edgesToCheck.filter(e =>
                (internalIds.has(e.source) || e.source === MOCK_ID) && internalIds.has(e.target)
            );

            return verifyShapes(nodesToVerify, edgesToVerify, registry);
        };

        // 3. PASS 1: Verify First Iteration
        const result1 = runPass(loopInputShape, "1");
        if (!result1.ok) {
            const f = result1.failures[0];
            return { ok: false as const, error: `Iteration 1 Error: ${f.error} (Node: ${f.nodeId})` };
        }

        // 4. Determine Output of Pass 1
        const internalIds = new Set(safeData.internalNodes.map(n => n.id));
        const outputEdge = safeData.internalEdges.find(e => !internalIds.has(e.target));

        if (!outputEdge) return { ok: false as const, error: "Stack disconnected from Output." };

        const lastNodeId = outputEdge.source;
        const pass1OutputShape = result1.shapes[lastNodeId]?.defaultShape;

        if (!pass1OutputShape) return { ok: false as const, error: "Could not calculate shape of stack block." };

        // If stack size is 1, we are done
        if ((data.repetitions || 1) <= 1) return { ok: true as const };

        // 5. PASS 2: Verify Second Iteration (Compatibility Check)
        // Can the output of Block 1 feed into Block 2?
        const result2 = runPass(pass1OutputShape, "2");

        if (!result2.ok) {
            return {
                ok: false as const,
                error: `Shape Mismatch: Block output [${pass1OutputShape}] cannot feed into next block. (Iteration 2 Failed)`
            };
        }

        return { ok: true as const };
    }

    static shapeCompute(data: ModuleListData, inputShapes: number[][]) {
        // Optimistic: Return input shape if undefined, or result of 1st pass logic if we had access to it.
        // Without full simulation, passing the input shape is the safest UI placeholder.
        if (!inputShapes || inputShapes.length === 0 || !inputShapes[0]) return [[]];
        return inputShapes[0];
    }

    // --- CODE GENERATION ---
    static getInitCode(data: ModuleListData, name: string) {
        if (!data.internalNodes || data.internalNodes.length === 0) {
            return `self.${name} = nn.ModuleList() # Empty Stack`;
        }

        const N = data.repetitions || 1;

        // 1. Compile internal graph
        const { initLines } = compileGraphToScript(
            data.internalNodes,
            data.internalEdges
        );

        if (!initLines || initLines.length === 0) return `pass`;

        // 2. Extract Definitions (Right-hand side of assignments)
        // Transforms "self.layer_xyz = nn.Linear(...)" -> "nn.Linear(...)"
        const layerDefs: string[] = [];
        initLines.forEach(l => {
            const parts = l.text.split("=");
            if (parts.length > 1) {
                layerDefs.push(parts.slice(1).join("=").trim());
            }
        });

        // 3. Construct the Code
        // Scenario A: Single Layer -> simple list comprehension
        if (layerDefs.length === 1) {
            return `self.${name} = nn.ModuleList([
            ${layerDefs[0]} 
            for _ in range(${N})
        ])`;
        }

        // Scenario B: Multiple Layers -> Wrap in nn.Sequential
        // We indent the sequential block cleanly
        const sequentialBody = layerDefs.join(",\n                ");
        const sequentialBlock = `nn.Sequential(
                ${sequentialBody}
            )`;

        return `self.${name} = nn.ModuleList([
            ${sequentialBlock} 
            for _ in range(${N})
        ])`;
    }

    static getForwardCode(data: ModuleListData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";

        if (!data.internalNodes || data.internalNodes.length === 0) {
            return `${outputVar} = ${inputVar}`;
        }

        return `
        # Stack Execution (Depth: ${data.repetitions})
        _h = ${inputVar}
        for block in self.${name}:
            _h = block(_h)
        ${outputVar} = _h
        `.trim();
    }

    static Component = createModuleListComponent(ModuleListNode.label, ModuleListNode.paramSchema);
}

// ==========================================
// 3. The UI Component (Factory)
// ==========================================

export function createModuleListComponent(
    label: string,
    paramSchema: Record<string, FieldSpec>,
) {
    return ({ id, data, isConnectable, selected, width, height }: ResizableNodeProps) => {
        const { setNodes, setEdges } = useReactFlow();
        const [isExpanded] = useState(true);
        const safeData = data || ({} as ModuleListData);

        const childCount = (safeData as any).internalNodes?.length || 0;

        const DEFAULT_W = 400;
        const DEFAULT_H = 300;

        // Auto-sizing fallback
        useEffect(() => {
            if (!width || !height) {
                setNodes((nodes) =>
                    nodes.map((n) => {
                        if (n.id === id) {
                            return {
                                ...n,
                                zIndex: -1,
                                style: { ...n.style, width: DEFAULT_W, height: DEFAULT_H },
                            };
                        }
                        return n;
                    })
                )
            }
        }, [id, width, height, setNodes]);

        const onChange = (key: string, type: FieldType) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            let newValue: any = e.target.value;
            if (type === "number") newValue = newValue === "" ? undefined : parseFloat(newValue);
            setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, [key]: newValue } } : n));
        };

        const handleDelete = () => {
            setNodes(nodes => nodes.filter(n => n.id !== id))
            setEdges(eds => eds.filter(edge => edge.source !== id && edge.target !== id));
        }

        const renderWidth = width ?? DEFAULT_W;
        const renderHeight = height ?? DEFAULT_H;

        // Visual Theme: Amber/Orange for Stacks (vs Teal for Loops)
        const accentColor = selected ? "#fbbf24" : "#665"; // Amber-400
        const headerColor = selected ? "rgba(251, 191, 36, 0.1)" : "rgba(255, 255, 255, 0.03)";
        const iconColor = selected ? "#fbbf24" : "#aaa";
        const tagColor = "#fbbf24";

        const handleSize = 14;
        const baseHandleStyle = { width: handleSize, height: handleSize, zIndex: 50, border: `2px solid #1a1a1a` };

        // --- RESIZE CONTROLS ---
        function ResizeBracket({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
            const baseStyle: React.CSSProperties = {
                background: 'transparent', border: 'none', width: 16, height: 16,
                position: 'absolute', transition: 'none', pointerEvents: 'all'
            }
            const variantStyle: React.CSSProperties = (() => {
                const color = accentColor;
                const borderThick = '3px solid ' + color;
                const offset = -2;
                switch (position) {
                    case 'top-left': return { borderTop: borderThick, borderLeft: borderThick, top: offset, left: offset };
                    case 'top-right': return { borderTop: borderThick, borderRight: borderThick, top: offset, right: offset };
                    case 'bottom-left': return { borderBottom: borderThick, borderLeft: borderThick, bottom: offset, left: offset };
                    case 'bottom-right': return { borderBottom: borderThick, borderRight: borderThick, bottom: offset, right: offset };
                    default: return {};
                }
            })();
            return <NodeResizeControl minWidth={350} minHeight={200} position={position} style={{ ...baseStyle, ...variantStyle }} />
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
                        backgroundColor: "rgba(25, 20, 15, 0.9)", // Slightly warmer background
                        backdropFilter: "blur(8px)",
                        border: `2px solid ${accentColor}`,
                        borderRadius: "16px",
                        boxShadow: selected ? "0 10px 40px rgba(251, 191, 36, 0.15)" : "0 4px 12px rgba(0,0,0,0.4)",
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        transition: "all 0.1s ease-in-out",
                    }}
                >
                    {/* Header */}
                    <div style={{
                        height: '40px',
                        background: headerColor,
                        borderBottom: `1px solid ${selected ? 'rgba(251, 191, 36, 0.3)' : 'rgba(255, 255, 255, 0.05)'}`,
                        display: 'flex', alignItems: 'center', padding: '0 12px', justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            {/* Stack Icon */}
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 17h6" /><path d="M9 12h6" /><path d="M9 7h6" />
                                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                            </svg>
                            <span style={{ fontWeight: 700, color: '#eee', fontSize: '12px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                {label}
                            </span>
                            {childCount > 0 && (
                                <span style={{ fontSize: '10px', background: tagColor, color: '#0b0d10', fontWeight: 800, padding: '2px 8px', borderRadius: '12px' }}>
                                    {childCount} Nodes
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>SIZE</span>
                            <input
                                type="number"
                                className="nodrag"
                                value={safeData['repetitions'] || 2}
                                onChange={onChange('repetitions', 'number')}
                                style={{ width: '44px', fontSize: '12px', textAlign: 'center', fontWeight: 'bold', background: '#0b0d10', border: '1px solid #444', color: tagColor, borderRadius: 6, padding: '4px 0' }}
                            />
                            <button onClick={handleDelete} className="nodrag" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff5555', fontSize: '18px', display: 'flex', alignItems: 'center' }}>×</button>
                        </div>
                    </div>

                    {/* Content Area & Labels */}
                    <div style={{ flex: 1, position: 'relative' }}>
                        {/* Internal Labels */}
                        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-25%)' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: tagColor, opacity: 0.8, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                                BLOCK IN
                            </span>
                        </div>
                        <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-25%)' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: tagColor, opacity: 0.8, writingMode: 'vertical-rl' }}>
                                BLOCK OUT
                            </span>
                        </div>
                        {childCount === 0 && (
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                color: 'rgba(255,255,255,0.1)', fontSize: '14px', fontWeight: 600, pointerEvents: 'none',
                                textAlign: 'center', border: '2px dashed rgba(255,255,255,0.1)', padding: '20px', borderRadius: '12px'
                            }}>
                                DEFINE BLOCK HERE
                            </div>
                        )}
                    </div>
                </div>

                {/* --- HANDLES --- */}
                {/* 1. EXTERNAL INPUT (Left Edge) */}
                <Handle type='target' position={Position.Left} id="in-external"
                    style={{ ...baseHandleStyle, background: '#fff', left: -9 }} isConnectable={isConnectable} />

                {/* 2. INTERNAL START (Left Inner) - Force Position */}
                <Handle type='source' position={Position.Right} id='in-internal'
                    style={{ ...baseHandleStyle, background: tagColor, borderRadius: '4px', left: 4, right: 'auto', top: '50%' }}
                    isConnectable={isConnectable} />

                {/* 3. INTERNAL END (Right Inner) - Force Position */}
                <Handle type="target" position={Position.Left} id="out-internal"
                    style={{ ...baseHandleStyle, background: tagColor, borderRadius: '4px', right: 4, left: 'auto', top: '50%' }}
                    isConnectable={isConnectable} />

                {/* 4. EXTERNAL OUTPUT (Right Edge) */}
                <Handle type="source" position={Position.Right} id="out-external"
                    style={{ ...baseHandleStyle, background: '#fff', right: -9 }} isConnectable={isConnectable} />
            </>
        )
    };
}