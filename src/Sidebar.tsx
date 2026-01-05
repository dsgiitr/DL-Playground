import { useMemo, useState } from "react";
import { NODE_GROUPS } from "./types/nodeTypes";
import type { SavedModule } from "./utils/moduleRegistry";

export default function Sidebar({
    onGenerateCode,
    codePanelOpen,
    onCollapse,
    modules,
    onDeleteModule
}: { onGenerateCode: () => void; codePanelOpen: boolean; onCollapse: () => void; modules: SavedModule[]; onDeleteModule: (id: string) => void }) {
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
        Object.keys(NODE_GROUPS).reduce<Record<string, boolean>>((acc, key) => {
            acc[key] = false; // start collapsed
            return acc;
        }, {})
    );
    const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: string, payload?: Record<string, unknown>) => {
        event.dataTransfer.setData("application/reactflow", nodeType);
        if (payload) {
            event.dataTransfer.setData("application/module-meta", JSON.stringify(payload));
        }
        event.dataTransfer.effectAllowed = "move";
    };
    const onReset = () => {
        if (window.confirm("This will clear Local storage and reload")) {
            localStorage.removeItem("nodes");
            localStorage.removeItem("edges");
            window.location.reload();
        }
    };
    
    // add the open module editor function in the sidebar to wire up the opening of module for editing
    const openModuleEditor = (moduleId: string) => {
        window.dispatchEvent(new CustomEvent("module-open", { detail: { moduleId } }));
    };

    const groups = useMemo(
        () =>
            Object.entries(NODE_GROUPS).map(([key, group]) => ({
                key,
                label: group.label,
                nodes: group.nodes
            })),
        []
    );

    const toggleGroup = (key: string) => {
        setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <aside style={{ background: "#484444", padding: "2vw", textTransform: "capitalize", height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
                {modules.length > 0 && (
                    <div style={{ marginBottom: 12, border: "1px solid #666", borderRadius: 8, background: "#3d3a3a" }}>
                        <button
                            onClick={() => toggleGroup("custom_modules")}
                            style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "8px 10px",
                                background: "transparent",
                                border: "none",
                                color: "#e6edf3",
                                fontWeight: 700,
                                fontSize: 12,
                                letterSpacing: "0.02em",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                cursor: "pointer"
                            }}
                            aria-expanded={openGroups["custom_modules"]}
                        >
                            <span
                                style={{
                                    display: "inline-block",
                                    transition: "transform 0.2s",
                                    transform: openGroups["custom_modules"] ? "rotate(90deg)" : "rotate(0deg)"
                                }}
                            >
                                ▶
                            </span>
                            <span>Custom Modules</span>
                        </button>
                        {openGroups["custom_modules"] && (
                            <div style={{ padding: "6px 10px 10px" }}>
                                {modules.map(mod => (
                                    <div
                                        key={mod.id}
                                        style={{
                                            padding: 8,
                                            border: "1px solid #888",
                                            borderRadius: 6,
                                            cursor: "grab",
                                            marginBottom: 8,
                                            background: "#504b4b",
                                            color: "#fff",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 4
                                        }}
                                        draggable
                                        onDragStart={event =>
                                            onDragStart(event, "module_ref", {
                                                moduleId: mod.id,
                                                name: mod.name,
                                                version: mod.version,
                                                handles: mod.handles,
                                                description: mod.description
                                            })
                                        }
                                        title={mod.description || `Module ${mod.name}`}
                                    >
                                        {/* open the module from the sidebar, the moduleCard */}
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                            <span style={{ fontWeight: 700 }}>{mod.name}</span>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 70 }}>
                                                <button
                                                    className="nodrag"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        onDeleteModule(mod.id);
                                                    }}
                                                    style={{
                                                        padding: "4px 6px",
                                                        background: "#2b2b2b",
                                                        border: "1px solid #555",
                                                        color: "#ddd",
                                                        borderRadius: 6,
                                                        cursor: "pointer",
                                                        fontSize: 10,
                                                        width: "100%",
                                                    }}
                                                    title="Delete module"
                                                >
                                                    Delete
                                                </button>
                                                <button
                                                    className="nodrag"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        openModuleEditor(mod.id);
                                                    }}
                                                    style={{
                                                        padding: "4px 6px",
                                                        background: "#1f8ecd",
                                                        border: "1px solid #1f8ecd",
                                                        color: "#fff",
                                                        borderRadius: 6,
                                                        cursor: "pointer",
                                                        fontSize: 10,
                                                        width: "100%",
                                                    }}
                                                    title="Open module for editing"
                                                >
                                                    Update
                                                </button>
                                            </div>
                                        </div>
                                        <span style={{ fontSize: 11, color: "#d0d0d0" }}>
                                            {mod.version} • {mod.handles.inputs.length} in / {mod.handles.outputs.length} out
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {groups.map(({ key, label, nodes }) => {
                    const open = !!openGroups[key];
                    return (
                        <div key={key} style={{ marginBottom: 12, border: "1px solid #666", borderRadius: 8, background: "#3d3a3a" }}>
                            <button
                                onClick={() => toggleGroup(key)}
                                style={{
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "8px 10px",
                                    background: "transparent",
                                    border: "none",
                                    color: "#e6edf3",
                                    fontWeight: 700,
                                    fontSize: 12,
                                    letterSpacing: "0.02em",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    cursor: "pointer"
                                }}
                                aria-expanded={open}
                            >
                                <span style={{ display: "inline-block", transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
                                    ▶
                                </span>
                                <span>{label}</span>
                            </button>
                            {open && (
                                <div style={{ padding: "6px 10px 10px" }}>
                                    {Object.keys(nodes).map(type => (
                                        <div
                                            key={type}
                                            style={{
                                                padding: 8,
                                                border: "1px solid #888",
                                                borderRadius: 6,
                                                cursor: "grab",
                                                marginBottom: 8,
                                                background: "#504b4b",
                                                color: "#fff"
                                            }}
                                            draggable
                                            onDragStart={event => onDragStart(event, type)}
                                        >
                                            {type.replace("_", " ")}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <button
                onClick={onReset}
                style={{
                    marginTop: "auto",
                    padding: "12px",
                    backgroundColor: "#d9534f",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: "14px",
                    transition: "background 0.2s",
                }}
            >
                {" "}
                Reset & Reload{" "}
            </button>

            <button
                onClick={onGenerateCode}
                style={{
                    marginTop: 8,
                    padding: "12px",
                    backgroundColor: "#1f8ecd",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: "14px",
                }}
            >
                {codePanelOpen ? "Hide Live Code" : "Show Live Code"}
            </button>

            <button
                onClick={onCollapse}
                style={{
                    marginTop: 8,
                    padding: "10px",
                    backgroundColor: "#444",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: "12px",
                }}
            >
                Collapse Sidebar
            </button>
        </aside>
    );
}
