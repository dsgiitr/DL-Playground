import { type Edge, type Node } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FieldSpec } from "../../../node_gen/BaseClass";
import type { ModuleRefData } from "../../../nodes/ModuleRefNode";
import { sanitizeIdent } from "../../../utils/codeCompile";
import { applyGraphIR, buildGraphIR } from "../../../utils/graphIR";
import {
    deleteModule,
    getModule,
    listModules,
    resolveModuleName,
    saveExistingModule,
    saveModule,
    type SavedModule,
} from "../../../utils/moduleRegistry";
import { getActiveModule, popModule, pushModule, type OpenModule } from "../../../utils/stackNavigation";

export type ModuleHandles = { inputs: string[]; outputs: string[] };

export type PromotableParam = {
    nodeId: string;
    nodeLabel: string;
    paramName: string;
    spec: FieldSpec;
};
type UseModuleSystemProps = {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setModules?: React.Dispatch<React.SetStateAction<SavedModule[]>>;
    getNodeSchema?: (nodeType: string) => Record<string, FieldSpec>;
};

export function useModuleSystem({ nodes, edges, setNodes, getNodeSchema }: UseModuleSystemProps) {
    const [modules, setModules] = useState<SavedModule[]>(() => listModules());
    const [moduleStack, setModuleStack] = useState<OpenModule[]>([]);
    const openModule = getActiveModule(moduleStack);
    const [showModuleDiagram, setShowModuleDiagram] = useState(false);

    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showSaveCopyModal, setShowSaveCopyModal] = useState(false);
    const [showModuleSaveMenu, setShowModuleSaveMenu] = useState(false);
    const [moduleNameWarning, setModuleNameWarning] = useState(false);

    const [pendingModuleName, setPendingModuleName] = useState("");
    const [pendingVariables, setPendingVariables] = useState<Record<string, FieldSpec>>({});
    const [paramToVariableMap, setParamToVariableMap] = useState<Record<string, Record<string, string>>>({});
    const [pendingModuleCopyName, setPendingModuleCopyName] = useState("");
    const [moduleNameInput, setModuleNameInput] = useState("");
    useEffect(() => {
        if (showSaveModal) {
            setPendingModuleName("");
            setPendingVariables({});
            setParamToVariableMap({});
        }
    }, [showSaveModal]);
    const addVariable = useCallback(() => {
        setPendingVariables(prev => {
            const count = Object.keys(prev).length + 1;
            let newName = `var${count}`;
            while (prev[newName]) {
                newName = `var${Math.floor(Math.random() * 1000)}`;
            }
            return { ...prev, [newName]: { type: "number", required: true } };
        });
    }, []);
    const renameVariable = useCallback((oldName: string, newName: string) => {
        if (!newName || newName == oldName) return;
        setPendingVariables(prevVars => {
            if (prevVars[newName]) {
                alert(`Variable "${newName}" already exists`);
                return prevVars;
            }
            const { [oldName]: targetValue, ...rest } = prevVars;
            return {
                ...rest,
                [newName]: targetValue,
            };
        });
        setParamToVariableMap(prevMap => {
            const newMap: Record<string, Record<string, string>> = {};
            Object.keys(prevMap).forEach(nodeId => {
                newMap[nodeId] = {};
                Object.keys(prevMap[nodeId]).forEach(paramName => {
                    const currentVar = prevMap[nodeId][paramName];
                    if (currentVar === oldName) {
                        newMap[nodeId][paramName] = newName;
                    } else {
                        newMap[nodeId][paramName] = currentVar;
                    }
                });
            });
            return newMap;
        });
    }, []);
    const deleteVariable = useCallback((varName: string) => {
        setPendingVariables(prev => {
            const { [varName]: _unused, ...rest } = prev;

            return rest;
        });
        setParamToVariableMap(prevMap => {
            const newMap: Record<string, Record<string, string>> = {};
            Object.keys(prevMap).forEach(nodeId => {
                newMap[nodeId] = {};
                Object.keys(prevMap[nodeId]).forEach(paramName => {
                    if (prevMap[nodeId][paramName] !== varName) {
                        newMap[nodeId][paramName] = prevMap[nodeId][paramName];
                    }
                });
            });
            return newMap;
        });
    }, []);
    const promotableParams = useMemo<PromotableParam[]>(() => {
        if (!showSaveModal) return [];
        const selectedNodes = nodes.filter(n => n.selected);
        const params: PromotableParam[] = [];
        selectedNodes.forEach(node => {
            const nodeLabel = (node.data?.label as string) || node.type || "Node";
            console.log(`looking at node ${node.type}`);
            if (node.type === "module_ref") {
                const data = node.data as { moduleId?: string };
                if (data?.moduleId) {
                    const modDef = modules.find(m => m.id === data.moduleId);

                    if (modDef) {
                        const schema = modDef.variableSchema || {};
                        console.log(modDef);
                        console.log(`[Module system] Found schema for ${modDef.name}:`, Object.keys(schema));
                        Object.entries(schema).forEach(([varName, spec]) => {
                            params.push({
                                nodeId: node.id,
                                nodeLabel: `${modDef.name}`,
                                paramName: varName,
                                spec: spec,
                            });
                        });
                    }
                }
            } else if (getNodeSchema) {
                const schema = getNodeSchema(node.type || "");
                if (schema) {
                    Object.entries(schema).forEach(([paramName, spec]) => {
                        params.push({
                            nodeId: node.id,
                            nodeLabel: nodeLabel,
                            paramName,
                            spec,
                        });
                    });
                }
            }
            // Logic for standard should go here
        });
        return params;
    }, [showSaveModal, nodes, modules]);
    const updateParamMapping = useCallback((nodeId: string, paramName: string, variableName: string, spec?: any) => {
        setParamToVariableMap(prev => {
            const existingNodeParams = prev[nodeId] || {};
            return {
                ...prev,
                [nodeId]: {
                    ...existingNodeParams,
                    [paramName]: variableName,
                },
            };
        });

        // If user selects a variable which doesnt exist yet, create it
        if (variableName && spec) {
            setPendingVariables(prev => {
                if (!prev[variableName]) {
                    return { ...prev, [variableName]: spec };
                }
                return prev;
            });
        }
    }, []);
    useEffect(() => {
        setModuleNameInput(openModule?.module?.name || "");
    }, [openModule?.module?.name]);

    useEffect(() => {
        setModuleNameWarning(false);
    }, [showSaveModal, pendingModuleName, moduleNameInput, openModule]);

    useEffect(() => {
        const handler = (ev: Event) => {
            const custom = ev as CustomEvent<{ moduleId?: string; nodeId?: string; data?: ModuleRefData }>;
            const moduleId = custom.detail?.moduleId;
            if (!moduleId) return;
            const mod = getModule(moduleId);
            if (!mod) {
                alert("Module not found");
                return;
            }

            const moduleRefData = custom.detail?.data || {};
            const { nodes: rawNodes, edges: rawEdges } = applyGraphIR(mod.graph);

            const nodesWithVars = rawNodes.map(n => {
                let nodeData = n.data || {};
                if (mod.variableMap) {
                    for (const varName in mod.variableMap) {
                        const targets = mod.variableMap[varName];
                        for (const target of targets) {
                            if (target.nodeId === n.id) {
                                if (moduleRefData[varName] !== undefined) {
                                    nodeData = { ...nodeData, [target.paramName]: moduleRefData[varName] };
                                }
                            }
                        }
                    }
                }
                return { ...n, data: nodeData, selected: false };
            });

            const applied = {
                nodes: nodesWithVars.map(n => ({
                    ...n,
                    selected: false,
                    data: { ...(n.data || {}), __highlight: undefined },
                })),
                edges: rawEdges.map(e => ({ ...e, selected: false })),
            };

            if (!applied.nodes.length) {
                alert("Saved module is empty. You can now add new things and save changes.");
            }
            setModuleStack(stack =>
                pushModule(stack, {
                    module: mod,
                    nodes: applied.nodes,
                    edges: applied.edges,
                    fromNodeId: custom.detail?.nodeId,
                }),
            );
            setShowModuleDiagram(false);
        };
        window.addEventListener("module-open", handler as EventListener);
        return () => window.removeEventListener("module-open", handler as EventListener);
    }, []);

    const dedupe = <T>(arr: T[]) => Array.from(new Set(arr));

    const computeModuleHandles = useCallback(
        (selectedIds: Set<string>): ModuleHandles => {
            const incoming = edges.filter(e => !selectedIds.has(e.source) && selectedIds.has(e.target));
            const outgoing = edges.filter(e => selectedIds.has(e.source) && !selectedIds.has(e.target));
            return {
                inputs: dedupe(incoming.map(e => e.targetHandle || "in")),
                outputs: dedupe(outgoing.map(e => e.sourceHandle || "out")),
            };
        },
        [edges],
    );

    const handleSaveModule = useCallback(() => {
        const selectedNodes = nodes.filter(n => n.selected);
        const selectedIds = new Set(selectedNodes.map(n => n.id));

        if (!selectedNodes.length) {
            setShowSaveModal(false);
            return;
        }

        const internalEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));

        const name = pendingModuleName.trim();
        if (!name) {
            alert("Enter a module name.");
            return;
        }

        const variableMap: Record<string, Array<{ nodeId: string; paramName: string }>> = {};
        Object.keys(paramToVariableMap).forEach(nodeId => {
            const nodeParams = paramToVariableMap[nodeId];
            Object.keys(nodeParams).forEach(paramName => {
                const varName = nodeParams[paramName];
                if (varName) {
                    if (!variableMap[varName]) {
                        variableMap[varName] = [];
                    }
                    variableMap[varName].push({ nodeId, paramName });
                }
            });
        });

        const sanitizedName = sanitizeIdent(resolveModuleName(name, ""));
        const existingNames = modules.map(m => sanitizeIdent(resolveModuleName(m.name, "")));
        if (existingNames.includes(sanitizedName)) {
            setModuleNameWarning(true);
            return;
        }

        const handles = computeModuleHandles(selectedIds);
        const moduleGraph = buildGraphIR(selectedNodes, internalEdges);
        saveModule({
            name: sanitizedName,
            version: "v1",
            graph: moduleGraph,
            handles,
            internalNodes: selectedNodes,
            internalEdges,
            description: `Saved from ${selectedNodes.length} node(s)`,
            variableSchema: pendingVariables,
            variableMap,
        });
        setModules(listModules());
        setShowSaveModal(false);
    }, [nodes, edges, computeModuleHandles, pendingModuleName, modules, paramToVariableMap, pendingVariables]);

    const saveExistingModuleChanges = useCallback(() => {
        setModuleNameWarning(false);
        if (!openModule) return;

        const name = moduleNameInput.trim();
        if (!name) {
            alert("Enter a module name.");
            return;
        }

        const sanitizedName = sanitizeIdent(resolveModuleName(name, ""));
        const existingNamesExcludingCurrent = modules
            .filter(m => m.id !== openModule.module.id)
            .map(m => sanitizeIdent(resolveModuleName(m.name, "")));

        if (existingNamesExcludingCurrent.includes(sanitizedName)) {
            setModuleNameWarning(true);
            return;
        }

        saveExistingModule(openModule, sanitizedName, openModule.nodes);
        setModules(listModules());
        alert("Module saved");
        setModuleStack(popModule);
    }, [openModule, moduleNameInput, modules]);

    const saveModuleAsNew = useCallback(() => {
        if (!openModule) return;
        const baseName = resolveModuleName(moduleNameInput, openModule.module.name);
        setPendingModuleCopyName(baseName);
        setShowSaveCopyModal(true);
    }, [openModule, moduleNameInput]);

    const handleReturnCopyModule = useCallback(() => {
        if (!openModule) return;
        const updatedGraph = buildGraphIR(openModule.nodes, openModule.edges);
        const name = pendingModuleCopyName.trim();
        if (!name) {
            alert("Enter a module name.");
            return;
        }
        saveModule({
            name: name,
            version: "v1",
            graph: updatedGraph,
            handles: openModule.module.handles,
            internalNodes: openModule.nodes,
            internalEdges: openModule.edges,
            description: openModule.module.description,
        });
        setModules(listModules());
        alert("Module saved as new");
        setShowSaveCopyModal(false);
        setModuleStack(popModule);
    }, [openModule, pendingModuleCopyName]);

    const handleDeleteModule = useCallback(
        (id: string) => {
            deleteModule(id);
            const updatedModules = listModules();
            setModules(updatedModules);
            setNodes(nds => {
                const remaining = nds.filter(n => {
                    const data = (n.data || {}) as { moduleId?: string };
                    return data.moduleId !== id;
                });
                return remaining;
            });
        },
        [setNodes],
    );

    return {
        modules,
        setModules,
        moduleStack,
        setModuleStack,
        openModule,
        showModuleDiagram,
        setShowModuleDiagram,

        // Modal States
        showSaveModal,
        setShowSaveModal,
        showSaveCopyModal,
        setShowSaveCopyModal,
        showModuleSaveMenu,
        setShowModuleSaveMenu,
        moduleNameWarning,
        setModuleNameWarning,

        // Form States
        pendingModuleName,
        setPendingModuleName,
        pendingVariables,
        // setPendingVariables,
        paramToVariableMap,
        promotableParams,
        // setParamToVariableMap,

        pendingModuleCopyName,
        setPendingModuleCopyName,
        moduleNameInput,
        setModuleNameInput,
        addVariable,
        renameVariable,
        deleteVariable,
        updateParamMapping,
        // Actions
        handleSaveModule,
        saveExistingModuleChanges,
        saveModuleAsNew,
        handleReturnCopyModule,
        handleDeleteModule,
    };
}
