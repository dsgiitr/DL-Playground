import { nodeTypes } from "./types/nodeTypes";

export default function Sidebar() {
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
        <aside style={{ background: "#484444", padding: "2vw", textTransform: "capitalize" }}>
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
        </aside>
    );
}
