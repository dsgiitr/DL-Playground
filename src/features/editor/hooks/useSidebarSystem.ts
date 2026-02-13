import { useMemo, useState, useCallback } from "react";
import { NODE_GROUPS } from "../../../types/nodeTypes";
import type { SavedModule } from "../../../utils/moduleRegistry";

export function useSidebarSystem(modules: SavedModule[]) {
    const [searchQuery, setSearchQuery] = useState("");

    // Initialize groups as collapsed
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
        () =>
            Object.keys(NODE_GROUPS).reduce<Record<string, boolean>>(
                (acc, key) => {
                    acc[key] = false;
                    return acc;
                },
                { custom_modules: false },
            ), // Ensure custom_modules key exists
    );

    const normalizedQuery = searchQuery.trim().toLowerCase();

    // Helper to match text against query
    const matchesQuery = useCallback(
        (text?: string) => {
            return (text ?? "").toLowerCase().includes(normalizedQuery);
        },
        [normalizedQuery],
    );

    // Filter Custom Modules
    const filteredModules = useMemo(() => {
        if (!normalizedQuery) return modules;
        return modules.filter(
            mod => matchesQuery(mod.name) || matchesQuery(mod.version) || matchesQuery(mod.description),
        );
    }, [modules, normalizedQuery, matchesQuery]);

    // Filter Standard Node Groups
    const filteredGroups = useMemo(() => {
        return Object.entries(NODE_GROUPS)
            .map(([key, group]) => {
                const nodeEntries = Object.entries(group.nodes).map(([type, def]) => {
                    const label =
                        typeof (def as { label?: string }).label === "string"
                            ? (def as { label?: string }).label
                            : type;
                    return { type, label };
                });

                const filteredNodes = normalizedQuery
                    ? nodeEntries.filter(
                          node => matchesQuery(node.label) || matchesQuery(node.type) || matchesQuery(group.label),
                      )
                    : nodeEntries;

                return {
                    key,
                    label: group.label,
                    nodes: filteredNodes,
                };
            })
            .filter(group => group.nodes.length > 0);
    }, [normalizedQuery, matchesQuery]);

    const toggleGroup = useCallback((key: string) => {
        setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const onDragStart = useCallback(
        (event: React.DragEvent<HTMLDivElement>, nodeType: string, payload?: Record<string, unknown>) => {
            event.dataTransfer.setData("application/reactflow", nodeType);
            if (payload) {
                event.dataTransfer.setData("application/module-meta", JSON.stringify(payload));
            }
            event.dataTransfer.effectAllowed = "move";
        },
        [],
    );

    const handleReset = useCallback(() => {
        if (window.confirm("This will clear Local storage and reload")) {
            localStorage.removeItem("nodes");
            localStorage.removeItem("edges");
            localStorage.removeItem("graphIR");
            window.location.reload();
        }
    }, []);

    const openModuleEditor = useCallback((moduleId: string) => {
        window.dispatchEvent(new CustomEvent("module-open", { detail: { moduleId } }));
    }, []);

    return {
        searchQuery,
        setSearchQuery,
        openGroups,
        toggleGroup,
        filteredModules,
        filteredGroups,
        onDragStart,
        handleReset,
        openModuleEditor,
        normalizedQuery, // Exposed to help UI decide whether to force expand
    };
}
