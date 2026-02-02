import Sidebar from "../../../Sidebar"; // Reusing existing Sidebar component logic for now to save time
import type { SavedModule } from "../../../utils/moduleRegistry";

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
                    <Sidebar
                        onGenerateCode={onGenerateCode}
                        codePanelOpen={showLiveCode}
                        onCollapse={() => setSidebarCollapsed(true)}
                        modules={modules}
                        onDeleteModule={handleDeleteModule}
                    />
                )}
            </div>
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
