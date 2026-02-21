import CodeViewer from "../../../components/CodeViewer";

type CodePanelProps = {
    showLiveCode: boolean;
    codePanelWidth: number;
    dragCodePanel: boolean;
    setDragCodePanel: (val: boolean) => void;
    setShowLiveCode: (val: boolean) => void;
    generatedCode: string;
    onDownloadCode: () => void;
    generated: any; // spans and code
    handleSelectionTargets: (targets: { nodeIds: string[], edgeIds: string[] }) => void;
}

export function CodePanel({
    showLiveCode,
    codePanelWidth,
    dragCodePanel,
    setDragCodePanel,
    setShowLiveCode,
    generatedCode,
    onDownloadCode,
    generated,
    handleSelectionTargets
}: CodePanelProps) {
    if (!showLiveCode) return null;

    return (
        <>
            <div
                onMouseDown={(ev) => {
                    ev.preventDefault();
                    setDragCodePanel(true);
                }}
                style={{
                    width: 10,
                    cursor: "col-resize",
                    flexShrink: 0,
                    background: dragCodePanel ? "#64ffda55" : "#2a2a2a",
                    borderLeft: "1px solid #222",
                    position: "relative",
                    zIndex: 10
                }}
                title="Drag to resize code panel"
            />

            <div
                style={{
                    width: codePanelWidth,
                    flexShrink: 0,
                    height: "100%",
                    background: "#0f1115",
                    borderLeft: "1px solid #222",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 0 20px rgba(0,0,0,0.35)",
                    position: "relative",
                    zIndex: 5
                }}
            >
                <div
                    style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid #222",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#12141a",
                        flexShrink: 0
                    }}
                >
                    <span style={{ color: "#e6edf3", fontWeight: 600 }}>Live PyTorch Code</span>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            onClick={() => navigator.clipboard.writeText(generatedCode)}
                            style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer" }}
                        >
                            Copy
                        </button>
                        <button
                            onClick={onDownloadCode}
                            style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer" }}
                        >
                            Download
                        </button>
                        <button
                            onClick={() => setShowLiveCode(false)}
                            style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer" }}
                        >
                            Collapse
                        </button>
                    </div>
                </div>
                <CodeViewer
                    code={generatedCode}
                    spans={generated.spans}
                    onSelectionChange={handleSelectionTargets}
                    style={{
                        flex: 1,
                        margin: 0,
                        padding: 4,
                        overflow: "hidden",
                        background: "#0b0d10",
                        color: "#d4d4d4",
                        fontSize: 11,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        lineHeight: 1.5
                    }}
                />
            </div>
        </>
    );
}
