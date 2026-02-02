import React, { useEffect, useState } from "react";
import { type FieldSpec, type FieldType, type LayerData } from "../../node_gen/BaseClass";
import { Handle, NodeResizeControl, Position, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { compileGraphToScript } from "../../utils/codeCompile";
import { verifyShapes } from "../../utils/shape_verifier";


type ResizableNodeProps = NodeProps<Node<LayerData>> & {
    width?: number;
    height?: number;
};

type ModuleListData = {
    repetitions: number;
    internalNodes: Node[];
    internalEdges: Edge[];
}


export class ModuleListNode {
    static label = "Module List (Stack)";
    static encapsulatesChildInit = true;
    static paramSchema: Record<string, FieldSpec> = {
        repetitions: {
            required: true,
            type: 'number',
            label: 'Stack Size',
            defaultValue: 2,
            step: 1
        }
    }

    /**
     * Helper: Generates virtual edges connecting the Container's input/output 
     * directly to the internal nodes. This allows "Auto-Wiring".
     */
    private static getImplicitEdges(data: ModuleListData): Edge[] {
        if (!data.internalNodes || data.internalNodes.length === 0) return [];

        const internalIds = new Set(data.internalNodes.map(n => n.id));

        // 1. Find Entry Nodes (Nodes with no internal incoming edges)
        const entries = data.internalNodes.filter(n =>
            !data.internalEdges.some(e => e.target === n.id && internalIds.has(e.source))
        );

        // 2. Find Exit Nodes (Nodes with no internal outgoing edges)
        const exits = data.internalNodes.filter(n =>
            !data.internalEdges.some(e => e.source === n.id && internalIds.has(e.target))
        );

        const virtualEdges: Edge[] = [];

        entries.forEach((node, i) => {
            virtualEdges.push({
                id: `_implicit_in_${i}`,
                source: "CONTAINER_INPUT", // Virtual Source
                sourceHandle: "in-external",
                target: node.id,
                targetHandle: null // Connect to default input
            });
        });

        // Connect Exit Nodes -> Virtual Output
        exits.forEach((node, i) => {
            virtualEdges.push({
                id: `_implicit_out_${i}`,
                source: node.id,
                sourceHandle: null, // Connect from default output
                target: "CONTAINER_OUTPUT", // Virtual Target
                targetHandle: "out-external"
            });
        });

        return [...data.internalEdges, ...virtualEdges];
    }

    // --- SHAPE VERIFIER ---
    static shapeVerifier(data: ModuleListData, inputShapes: number[][], registry?: Record<string, any>) {
        const safeData = data || { internalNodes: [], internalEdges: [] };

        if (!safeData.internalNodes || safeData.internalNodes.length === 0) return { ok: true as const };
        if (!registry) return { ok: false as const, error: "System Error: Registry missing." };
        if (!inputShapes || inputShapes.length === 0) return { ok: false as const, error: "Input required." };

        const loopInputShape = inputShapes[0];
        const allEdges = this.getImplicitEdges(safeData); // Use Implicit Edges

        // 1. Helper to run a verification pass
        const runPass = (inputShape: number[], passLabel: string) => {
            const MOCK_ID = `__STACK_ENTRY_${passLabel}__`; // Must match the source used in getImplicitEdges? No, we re-map.

            // Mock Input Node
            const mockDims = inputShape.map((size, idx) => ({
                label: `D${idx}`, size: size.toString(), type: "inferred"
            }));
            const mockInputNode: Node = {
                id: MOCK_ID, type: "input_layer", position: { x: 0, y: 0 },
                data: { label: `Iter ${passLabel} In`, dims: mockDims }
            };

            const internalIds = new Set(safeData.internalNodes.map(n => n.id));

            // Reroute the virtual input edges to our Mock Node
            const edgesToCheck = allEdges.map(e => {
                if (e.source === "CONTAINER_INPUT") return { ...e, source: MOCK_ID };
                return e;
            });

            // Filter out edges that leave the graph (Output edges)
            const edgesToVerify = edgesToCheck.filter(e =>
                (internalIds.has(e.source) || e.source === MOCK_ID) && internalIds.has(e.target)
            );

            const nodesToVerify = [...safeData.internalNodes, mockInputNode];
            return verifyShapes(nodesToVerify, edgesToVerify, registry);
        };

        // 2. PASS 1: Verify First Iteration
        const result1 = runPass(loopInputShape, "1");
        if (!result1.ok) {
            const f = result1.failures[0];
            return { ok: false as const, error: `Iteration 1 Error: ${f.error} (Node: ${f.nodeId})` };
        }

        // 3. Determine Output of Pass 1
        // We look for the virtual output edges we created
        const exitEdges = allEdges.filter(e => e.target === "CONTAINER_OUTPUT");
        if (exitEdges.length === 0) return { ok: false as const, error: "Stack has no output." };

        // Assuming single output for now
        const lastNodeId = exitEdges[0].source;
        const pass1OutputShape = result1.shapes[lastNodeId]?.defaultShape;

        if (!pass1OutputShape) return { ok: false as const, error: "Could not calculate shape." };

        // If stack size is 1, done
        if ((data.repetitions || 1) <= 1) return { ok: true as const };

        // 4. PASS 2: Compatibility Check
        const result2 = runPass(pass1OutputShape, "2");
        if (!result2.ok) {
            return {
                ok: false as const,
                error: `Shape Mismatch: Block output [${pass1OutputShape}] cannot feed into next block.`
            };
        }

        return { ok: true as const };
    }

    static shapeCompute(data: ModuleListData, inputShapes: number[][], registry?: Record<string, any>) {
        if (!inputShapes || !inputShapes[0] || !registry) return inputShapes?.[0] ? [inputShapes[0]] : [[]];

        let currentShape = inputShapes[0];
        const N = data.repetitions || 1;
        const MAX_SIM_STEPS = 5;

        // Use implicit edges
        const allEdges = this.getImplicitEdges(data);

        for (let i = 0; i < Math.min(N, MAX_SIM_STEPS); i++) {
            const MOCK_ID = `__COMPUTE_ITER_${i}__`;
            const mockDims = currentShape.map((size, idx) => ({
                label: `D${idx}`, size: size.toString(), type: "inferred"
            }));
            const mockInputNode: Node = {
                id: MOCK_ID, type: "input_layer", position: { x: 0, y: 0 },
                data: { label: `Sim In`, dims: mockDims }
            };

            const internalIds = new Set(data.internalNodes.map(n => n.id));

            // Map virtual edges
            const edges = allEdges.map(e => e.source === "CONTAINER_INPUT" ? { ...e, source: MOCK_ID } : e);

            const nodes = [...data.internalNodes, mockInputNode];
            const edgesFiltered = edges.filter(e =>
                (internalIds.has(e.source) || e.source === MOCK_ID) && internalIds.has(e.target)
            );

            const result = verifyShapes(nodes, edgesFiltered, registry);
            if (!result.ok) return [currentShape];

            // Find output
            const exitEdges = allEdges.filter(e => e.target === "CONTAINER_OUTPUT");
            if (exitEdges.length === 0) return [currentShape];

            const outputShape = result.shapes[exitEdges[0].source]?.defaultShape;
            if (!outputShape) return [currentShape];

            const isStable = outputShape.length === currentShape.length && outputShape.every((v, k) => v === currentShape[k]);
            currentShape = outputShape;
            if (isStable) break;
        }
        return currentShape;
    }

    // --- CODE GEN ---
    static getInitCode(data: ModuleListData, name: string) {
        if (!data.internalNodes || data.internalNodes.length === 0) {
            return `self.${name} = nn.ModuleList()`;
        }
        // Implicit edges are NOT passed to compileGraphToScript because 
        // that function generates valid variable names based on explicit edges.
        // However, we need to ensure the graph is connected.
        // For Init code, we just need the Node Definitions (self.layer = ...), 
        // so connectivity doesn't matter much.

        const { initLines } = compileGraphToScript(data.internalNodes, data.internalEdges);

        if (!initLines || initLines.length === 0) return `pass`;

        const layerDefs: string[] = [];
        initLines.forEach(l => {
            const parts = l.text.split("=");
            if (parts.length > 1) layerDefs.push(parts.slice(1).join("=").trim());
        });

        const N = data.repetitions || 1;

        if (layerDefs.length === 1) {
            return `self.${name} = nn.ModuleList([
            ${layerDefs[0]} 
            for _ in range(${N})
        ])`;
        }

        const sequentialBlock = `nn.Sequential(
                ${layerDefs.join(",\n                ")}
            )`;

        return `self.${name} = nn.ModuleList([
            ${sequentialBlock} 
            for _ in range(${N})
        ])`;
    }

    static getForwardCode(data: ModuleListData, name: string, inputs: Array<string>, outputs: Array<string>) {
        const inputVar = inputs[0] || "x";
        const outputVar = outputs[0] || "x";

        if (!data.internalNodes || data.internalNodes.length === 0) return `${outputVar} = ${inputVar}`;

        return `
        # Stack (${data.repetitions})
        _h = ${inputVar}
        for block in self.${name}:
            _h = block(_h)
        ${outputVar} = _h
        `.trim();
    }

    static Component = createModuleListComponent(ModuleListNode.label, ModuleListNode.paramSchema);
}

export function createModuleListComponent(
    label: string,
    paramSchema: Record<string, FieldSpec>,
) {
    return ({ id, data, isConnectable, selected, width, height }: ResizableNodeProps) => {
        const { setNodes, setEdges } = useReactFlow();
        const safeData = data || ({} as ModuleListData);
        const childCount = (safeData as any).internalNodes?.length || 0;
        const isEmpty = childCount === 0;

        const DEFAULT_W = 400;
        const DEFAULT_H = 300;

        useEffect(() => {
            if (!width || !height) {
                setNodes((nodes) =>
                    nodes.map((n) => n.id === id ? { ...n, style: { ...n.style, width: DEFAULT_W, height: DEFAULT_H } } : n)
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

        const accentColor = selected ? "#fbbf24" : "#665"; // Amber
        const bgStyle: React.CSSProperties = isEmpty
            ? {
                backgroundColor: "rgba(25, 20, 15, 0.4)",
                border: `2px dashed ${selected ? '#fbbf24' : '#555'}`, // Dashed when empty
                backdropFilter: "blur(2px)",
            }
            : {
                backgroundColor: "rgba(25, 20, 15, 0.9)",
                border: `2px solid ${accentColor}`, // Solid when occupied
                backdropFilter: "blur(8px)",
            };

        const handleSize = 14;
        const baseHandleStyle = { width: handleSize, height: handleSize, zIndex: 50, border: `2px solid #1a1a1a` };

        // Resize Helper
        function ResizeBracket({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
            // ... (Keep existing implementation)
            return <NodeResizeControl minWidth={250} minHeight={150} position={position} style={{ position: 'absolute', width: 16, height: 16, background: 'transparent', border: 'none' }} />
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

                {/* --- CONTAINER --- */}
                <div
                    style={{
                        width: `${renderWidth}px`, height: `${renderHeight}px`,
                        borderRadius: "16px",
                        boxShadow: selected ? "0 10px 40px rgba(251, 191, 36, 0.15)" : "0 4px 12px rgba(0,0,0,0.4)",
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        transition: "all 0.1s ease-in-out",
                        ...bgStyle
                    }}
                >
                    {/* Header */}
                    <div style={{
                        height: '40px',
                        background: selected ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                        borderBottom: `1px solid ${selected ? 'rgba(251, 191, 36, 0.3)' : 'rgba(255, 255, 255, 0.05)'}`,
                        display: 'flex', alignItems: 'center', padding: '0 12px', justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 17h6" /><path d="M9 12h6" /><path d="M9 7h6" /><rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                            </svg>
                            <span style={{ fontWeight: 700, color: '#eee', fontSize: '12px', textTransform: 'uppercase' }}>{label}</span>
                            {!isEmpty && (
                                <span style={{ fontSize: '10px', background: '#fbbf24', color: '#0b0d10', fontWeight: 800, padding: '2px 8px', borderRadius: '12px' }}>
                                    {childCount} Layers
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>SIZE</span>
                            <input type="number" className="nodrag" value={safeData['repetitions'] || 2} onChange={onChange('repetitions', 'number')}
                                style={{ width: '44px', fontSize: '12px', textAlign: 'center', fontWeight: 'bold', background: '#0b0d10', border: '1px solid #444', color: '#fbbf24', borderRadius: 6, padding: '4px 0' }} />
                            <button onClick={handleDelete} className="nodrag" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff5555', fontSize: '18px' }}>×</button>
                        </div>
                    </div>

                    {/* Content / Drop Zone */}
                    <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isEmpty ? (
                            <div style={{
                                textAlign: 'center', color: '#888', pointerEvents: 'none',
                                display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center'
                            }}>
                                <span style={{ fontSize: '24px', opacity: 0.3 }}>⇩</span>
                                <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: 0.5 }}>DROP LAYER HERE</span>
                            </div>
                        ) : (
                            // Hide internal labels if occupied to reduce clutter
                            <div style={{
                                position: 'absolute', inset: 0,
                                background: 'repeating-linear-gradient(45deg, rgba(251, 191, 36, 0.03) 0px, rgba(251, 191, 36, 0.03) 10px, transparent 10px, transparent 20px)'
                            }} />
                        )}
                    </div>
                </div>

                {/* --- HANDLES --- */}
                {/* We ONLY render External handles. 
                   The internal wiring is now handled by getImplicitEdges in the class logic.
                   We assume standard Left->Right flow.
                */}
                <Handle type='target' position={Position.Left} id="in-external"
                    style={{ ...baseHandleStyle, background: '#fff', left: -9 }} isConnectable={isConnectable} />

                <Handle type="source" position={Position.Right} id="out-external"
                    style={{ ...baseHandleStyle, background: '#fff', right: -9 }} isConnectable={isConnectable} />
            </>
        )
    };
}