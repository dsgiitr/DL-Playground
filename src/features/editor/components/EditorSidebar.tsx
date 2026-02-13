import type { SavedModule } from "../../../utils/moduleRegistry";
import { useSidebarSystem } from "../hooks/useSidebarSystem";

type EditorSidebarProps = {
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    dragSidebar: boolean;
    setSidebarCollapsed: (v: boolean) => void;
    setDragSidebar: (v: boolean) => void;
    onGenerateCode: () => void;
    showLiveCode: boolean;
    modules: SavedModule[];
    handleDeleteModule: (id: string) => void;
};

export function EditorSidebar({
    sidebarCollapsed,
    sidebarWidth,
    dragSidebar,
    setSidebarCollapsed,
    setDragSidebar,
    onGenerateCode,
    showLiveCode,
    modules,
    handleDeleteModule,
}: EditorSidebarProps) {
    // Moved logic from Sidebar.tsx to useSidebarSystem hook
    const {
        searchQuery,
        setSearchQuery,
        openGroups,
        toggleGroup,
        filteredModules,
        filteredGroups,
        onDragStart,
        handleReset,
        openModuleEditor,
        normalizedQuery
    } = useSidebarSystem(modules);

    return (
        <>
            <div
                style={{
                    width: sidebarCollapsed ? 28 : sidebarWidth,
                    flexShrink: 0,
                    transition: dragSidebar ? "none" : "width 0.15s",
                    background: "#484444",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    position: "relative",
                    borderRight: "1px solid #222"
                }}
            >
                {sidebarCollapsed ? (
                    <button
                        onClick={() => setSidebarCollapsed(false)}
                        style={{
                            width: "100%",
                            height: "100%",
                            writingMode: "vertical-rl",
                            background: "#1f8ecd",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                            fontWeight: 700
                        }}
                        title="Expand sidebar"
                    >
                        Show Nodes
                    </button>
                ) : (
                    <aside style={{ padding: "16px", textTransform: "capitalize", height: "100%", display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
                        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
                            {/* Search Bar */}
                            <div style={{ marginBottom: 12 }}>
                                <input
                                    value={searchQuery}
                                    onChange={event => setSearchQuery(event.target.value)}
                                    placeholder="Search layers..."
                                    style={{
                                        width: "100%",
                                        boxSizing: "border-box",
                                        padding: "8px 10px",
                                        borderRadius: 8,
                                        border: "1px solid #555",
                                        background: "#2f2b2b",
                                        color: "#e6edf3",
                                        fontSize: 12,
                                    }}
                                />
                            </div>

                            {/* Custom Modules Section */}
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
                                                transform: (normalizedQuery || openGroups["custom_modules"]) ? "rotate(90deg)" : "rotate(0deg)"
                                            }}
                                        >
                                            ▶
                                        </span>
                                        <span>Custom Modules</span>
                                    </button>
                                    {(normalizedQuery || openGroups["custom_modules"]) && (
                                        <div style={{ padding: "6px 10px 10px" }}>
                                            {filteredModules.map(mod => (
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
                                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                                        <span style={{ fontWeight: 700 }}>{mod.name}</span>
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 70 }}>
                                                            <button
                                                                className="nodrag"
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    handleDeleteModule(mod.id);
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
                                            {normalizedQuery && filteredModules.length === 0 && (
                                                <div style={{ color: "#9ca3af", fontSize: 12, padding: "6px 4px" }}>
                                                    No modules match "{searchQuery.trim()}".
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Standard Nodes Groups */}
                            {filteredGroups.map(({ key, label, nodes }) => {
                                const open = normalizedQuery ? true : !!openGroups[key];
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
                                                {nodes.map(node => (
                                                    <div
                                                        key={node.type}
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
                                                        onDragStart={event => onDragStart(event, node.type)}
                                                    >
                                                        {node.label}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {normalizedQuery && filteredGroups.length === 0 && (
                                <div style={{ color: "#9ca3af", fontSize: 12, padding: "6px 4px" }}>
                                    No layers match "{searchQuery.trim()}".
                                </div>
                            )}
                        </div>

                        {/* Footer Buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', flexShrink: 0 }}>
                            <button
                                onClick={handleReset}
                                style={{
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
                                Reset & Reload
                            </button>

                            <button
                                onClick={onGenerateCode}
                                style={{
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
                                {showLiveCode ? "Hide Live Code" : "Show Live Code"}
                            </button>

                            <button
                                onClick={() => setSidebarCollapsed(true)}
                                style={{
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
                        </div>
                    </aside>
                )}
            </div>
            {/* Drag Handle */}
            <div
                onMouseDown={() => setDragSidebar(true)}
                style={{
                    width: 6,
                    cursor: "col-resize",
                    flexShrink: 0,
                    background: dragSidebar ? "#64ffda55" : "#2a2a2a",
                    borderRight: "1px solid #222"
                }}
                title="Drag to resize sidebar"
            />
        </>
    );
}