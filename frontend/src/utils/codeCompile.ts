import type { Edge, Node } from "@xyflow/react";
import type { ModuleRefData } from "../nodes/ModuleRefNode";
import { LAYER_REGISTRY } from "./layerRegistry";
import { getModule } from "./moduleRegistry";

export type CodeSpan = {
    line: number;
    kind: "header" | "init" | "forward" | "return";
    nodeId?: string;
    edgeIds?: string[];
};

export type CodeGenResult = {
    code: string;
    spans: CodeSpan[];
};

// Sanitize arbitrary labels/ids into valid Python identifiers.
export function sanitizeIdent(name: string): string {
    const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
    if (!cleaned.length) return "_x";
    const safe = /^[A-Za-z_]/.test(cleaned[0]) ? cleaned : `_${cleaned}`;
    return safe;
}

export function getRootGraph(nodes: Node[], edges: Edge[]) {
    // For now, we assume the provided nodes and edges ARE the root graph.
    // In a more complex setup where 'nodes' might contain everything including nested subgraphs (not how ReactFlow works usually),
    // we would filter. But here 'nodes' is the current view.
    return { rootNodes: nodes, rootEdges: edges };
}

export function createCustomComponentDAG(
    id: string,
    nodes: Node[],
    order: string[],
    color: Record<string, number>,
): boolean {
    // Color: 0 for unvisited, 1 for visiting, 2 for done visiting

    color[id] = 1; // Visiting

    let ok: boolean = true;
    nodes.forEach(child => {
        if (child.type && child.type === "module_ref") {
            const module_data = child.data as ModuleRefData;
            const module_id = module_data.moduleId as string;

            if (color[module_id] === 1) {
                return false; // Make sure to test this.
            } else if (color[module_id] !== 2) {
                const savedModule = getModule(module_id);
                const internalNodes: Node[] = savedModule?.internalNodes || [];
                ok = ok && createCustomComponentDAG(module_id, internalNodes, order, color);
            }
        }
    });

    order.push(id);
    color[id] = 2; // Visited

    return ok;
}

// This function works on the module level code generator and uses the generate main code function to generate code for individual modules.
// It first sorts the module ids based on the way they should be arranged in the code and then writes the code.
export function recursiveCodeGenerator(nodes: Node[], edges: Edge[]): CodeGenResult {
    let order: string[] = [];
    let color: Record<string, number> = {};
    createCustomComponentDAG("0", nodes, order, color);

    // *
    // For each module id, get it's code, shift it's lines by the number of previous lines
    // and add it to the main codegenresult object.
    //
    // /

    const lines: string[] = [];
    const spans: CodeSpan[] = [];

    lines.push("import torch", "import torch.nn as nn");
    spans.push({ line: 1, kind: "header" }, { line: 2, kind: "header" });

    let generatedCode: CodeGenResult = { code: lines.join("\n"), spans };

    let moduleNodes: Node[];
    let moduleEdges: Edge[];
    let moduleName: string;
    let lineOffset: number = lines.length;

    order.forEach(moduleId => {
        let savedModule: any = null;
        if (moduleId === "0") {
            // Accidental clash?
            moduleNodes = nodes;
            moduleEdges = edges;
            moduleName = "GeneratedModel";
        } else {
            savedModule = getModule(moduleId);
            if (savedModule) {
                moduleNodes = savedModule?.internalNodes || [];
                moduleEdges = savedModule?.internalEdges || [];
                moduleName = sanitizeIdent(savedModule.name);
            } else {
                console.warn(`Module with ID ${moduleId} not found or contract missing.`);
                moduleNodes = [];
                moduleEdges = [];
                moduleName = "unknownModule";
            }
        }
        generatedCode.code += "\n\n\n";
        lineOffset += 2;

        let moduleCode = generateMainCode(moduleNodes, moduleEdges, moduleName, lineOffset, savedModule);

        generatedCode.code += moduleCode.code;
        generatedCode.spans.push(...moduleCode.spans);
        lineOffset += moduleCode.code.split("\n").length;
    });
    return generatedCode;
}

// Converts graphs into 3 components: initlines, forward lines, returnVar
export function compileGraphToScript(
    nodes: Node[],
    edges: Edge[],
    variablePrefix: string = "", // Prefix for local variables to avoid namespace collisions
    variableMap?: Record<string, Array<{ nodeId: string; paramName: string }>>, // Variable mapping for custom modules
) {
    if (nodes.length === 0) return { code: "class Model(nn.Module):\n    pass", spans: [] };
    const initLines: { text: string; span?: Omit<CodeSpan, "line"> }[] = [];
    const forwardLines: { text: string; span?: Omit<CodeSpan, "line"> }[] = [];
    const nodeOutputMap: Record<string, string[]> = {};
    // 1. Build Adjacency List
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    nodes.forEach(n => {
        adj[n.id] = [];
        inDegree[n.id] = 0;
    });
    edges.forEach(e => {
        if (adj[e.source]) adj[e.source].push(e.target);
        if (inDegree[e.target] !== undefined) inDegree[e.target]++;
    });

    // 2. Topological Sort
    const queue: string[] = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    const sortedIds: string[] = [];

    while (queue.length > 0) {
        const u = queue.shift()!;
        sortedIds.push(u);
        if (adj[u]) {
            adj[u].forEach(v => {
                inDegree[v]--;
                if (inDegree[v] === 0) queue.push(v);
            });
        }
    }

    const finalOrderIds =
        sortedIds.length === nodes.length
            ? sortedIds
            : [...sortedIds, ...nodes.map(n => n.id).filter(id => !sortedIds.includes(id))];
    const sortedNodes = finalOrderIds.map(id => nodes.find(n => n.id === id)!);

    // This code creates a list of all the input and output edges of a node
    const incomingEdges: Record<string, Edge[]> = {};
    const outgoingEdges: Record<string, Edge[]> = {};

    nodes.forEach(n => {
        incomingEdges[n.id] = [];
        outgoingEdges[n.id] = [];
    });

    edges.forEach(e => {
        incomingEdges[e.target]?.push(e);
        outgoingEdges[e.source]?.push(e);
    });

    const getVarName = (base: string) => sanitizeIdent(`${variablePrefix}${base}`);
    const edgeLabel = (edge: Edge, fallback: string) => {
        const base = (edge.data as any)?.label || fallback;
        return getVarName(base);
    };

    const seedLines: { text: string; span?: Omit<CodeSpan, "line"> }[] = [];
    nodes
        .filter(n => (incomingEdges[n.id] ?? []).length === 0)
        .forEach(n => {
            const parentIsPresent = n.parentId && nodes.some(p => p.id === n.parentId);
            if (parentIsPresent) return;
            const outs = outgoingEdges[n.id] ?? [];
            outs.forEach((e, idx) => {
                const name = edgeLabel(e, `in_${n.id}_${idx}`);
                seedLines.push({
                    text: `        ${name} = x  # input passthrough`,
                    span: { kind: "forward", nodeId: n.id, edgeIds: [e.id] },
                });
            });
        });

    sortedNodes.forEach(node => {
        const layerName = `${sanitizeIdent(node.id)}_layer`;
        const type = node.type;
        if (!type || !LAYER_REGISTRY[type]) return;

        const ClassRef = LAYER_REGISTRY[type];
        const parentNode = node.parentId ? nodes.find(n => n.id === node.parentId) : null;
        const parentClass = parentNode ? LAYER_REGISTRY[parentNode.type!] : null;
        const shouldGenerateInit = !parentNode || !parentClass || !parentClass.encapsulatesChildInit;
        if (shouldGenerateInit) {
            let line = ClassRef.getInitCode(node.data, layerName, variableMap);
            
            // Apply variable mapping if provided
            if (variableMap) {
                for (const varName in variableMap) {
                    const targets = variableMap[varName];
                    for (const target of targets) {
                        if (target.nodeId === node.id) {
                            // Replace the parameter with the variable name
                            const paramRegex = new RegExp(`\\b${target.paramName}\\s*=\\s*[^,)]+`, 'g');
                            line = line.replace(paramRegex, `${target.paramName}=${varName}`);
                        }
                    }
                }
            }
            
            initLines.push({ text: `        ${line}`, span: { kind: "init", nodeId: node.id } });
        }
        const shouldGenerateForward = !parentNode;
        if (shouldGenerateForward) {
            const inEdges = incomingEdges[node.id];
            const inputNames =
                inEdges.length === 0 ? ["x"] : inEdges.map((e, idx) => edgeLabel(e, `in_${e.source || idx}`));

            const outEdges = outgoingEdges[node.id];
            const handlesSpec =
                typeof ClassRef.handles === "function" ? ClassRef.handles(node.data as any) : ClassRef.handles;
            const sourceHandles = handlesSpec?.sources && handlesSpec.sources.length ? handlesSpec.sources : [];
            const outputNames = (sourceHandles || []).length
                ? sourceHandles.map((handleId, idx) => {
                      const matching = outEdges.find(e => e.sourceHandle === handleId);
                      const base = matching
                          ? edgeLabel(matching, `out_${node.id}_${handleId}`)
                          : `out_${node.id}_${idx}`;
                      return sanitizeIdent(base);
                  })
                : outEdges.length === 0
                  ? [sanitizeIdent(`out_${node.id}`)]
                  : outEdges.map((e, idx) => edgeLabel(e, `out_${node.id}_${idx}`));
            nodeOutputMap[node.id] = outputNames;
            const forward_line = ClassRef.getForwardCode(node.data, layerName, inputNames, outputNames);

            forwardLines.push({
                text: `        ${forward_line}`,
                span: { kind: "forward", nodeId: node.id, edgeIds: outEdges.map(e => e.id) },
            });
        }
    });
    const terminalNodes = sortedNodes.filter(n => {
        const isTopLevel = !n.parentId || !nodes.some(p => p.id === n.parentId);
        const hasNoOutputs = (outgoingEdges[n.id] || []).length === 0;
        return isTopLevel && hasNoOutputs;
    });
    let returnVar = "x";
    const allTerminalOutputs: string[] = [];
    terminalNodes.forEach(n => {
        const outputs = nodeOutputMap[n.id] || [];
        allTerminalOutputs.push(...outputs);
    });
    if (allTerminalOutputs.length === 1) {
        returnVar = allTerminalOutputs[0];
    } else if (allTerminalOutputs.length > 1) {
        returnVar = `(${allTerminalOutputs.join(", ")})`;
    }
    return { initLines, forwardLines, returnVar };
}

// Code can be made more efficient by passing CodeGenResult by reference. Offset won't be required.
export function generateMainCode(
    nodes: Node[], 
    edges: Edge[], 
    name: string, 
    lineOffset: number,
    savedModule?: any // Optional: saved module with variableSchema and variableMap
): CodeGenResult {
    const lines: string[] = [];
    const spans: CodeSpan[] = [];

    lines.push(`class ${name}(nn.Module):`);
    spans.push({ line: 1 + lineOffset, kind: "header" });

    // Build __init__ signature with variable schema parameters
    const variableSchema = savedModule?.variableSchema || {};
    const pyLiteral = (spec: any, value: any) => {
        if (value === undefined || value === null) return "None";
        if (spec?.type === "string") return `"${value}"`;
        if (spec?.type === "boolean") return value ? "True" : "False";
        return `${value}`;
    };

    const variableParams = Object.entries(variableSchema).map(([varName, spec]: [string, any]) => {
        const required = spec?.required ?? false;
        const defaultValue = spec?.defaultValue;
        if (required) return varName;
        if (defaultValue !== undefined) return `${varName}=${pyLiteral(spec, defaultValue)}`;
        return `${varName}=None`;
    });

    const initSignature = variableParams.length > 0 
        ? `    def __init__(self, ${variableParams.join(", ")}):` 
        : "    def __init__(self):";
    
    lines.push(initSignature);
    lines.push("        super().__init__()");

    // Compile Main Graph with variable mapping
    const { initLines, forwardLines, returnVar } = compileGraphToScript(
        nodes, 
        edges, 
        "", 
        savedModule?.variableMap
    );

    // Stitch Init
    initLines?.forEach(l => {
        lines.push(l.text);
        if (l.span) spans.push({ ...l.span, line: lines.length + lineOffset });
    });
    lines.push("");

    lines.push("    def forward(self, x):");
    forwardLines?.forEach(l => {
        lines.push(l.text);
        if (l.span) spans.push({ ...l.span, line: lines.length + lineOffset });
    });
    lines.push(`        return ${returnVar}`);
    spans.push({ line: lines.length + lineOffset, kind: "return" });

    return { code: lines.join("\n"), spans };
}
