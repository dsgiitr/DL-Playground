import { nodeTypes } from "./types/nodeTypes";

export default function Sidebar({
    onGenerateCode,
    codePanelOpen,
    onCollapse
}: { onGenerateCode: () => void; codePanelOpen: boolean; onCollapse: () => void }) {
    const onDragStart = (event: React.DragEvent<HTMLDivElement>, nodeType: string) => {
        event.dataTransfer.setData("application/reactflow", nodeType);
        event.dataTransfer.effectAllowed = "move";
    };
    const onReset = () => {
        if (window.confirm("This will clear Local storage and reload")) {
            localStorage.removeItem("nodes");
            localStorage.removeItem("edges");
            window.location.reload();
        }
    };

    return (
        <aside style={{ background: "#484444", padding: "2vw", textTransform: "capitalize", height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.keys(nodeTypes).map(type => (
                <div
                    key={type}
                    style={{
                        padding: 8,
                        border: "1px solid #888",
                        borderRadius: 4,
                        cursor: "grab",
                        marginBottom: 8,
                    }}
                    draggable
                    onDragStart={event => onDragStart(event, type)}
                >
                    {type.replace("_", " ")}
                </div>
            ))}
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
