import type { FieldSpec } from "../../../node_gen/BaseClass";

type SaveModuleModalProps = {
    onClose: () => void;
    onSave: () => void;
    pendingModuleName: string;
    setPendingModuleName: (val: string) => void;
    pendingVariables: Record<string, FieldSpec>;
    setPendingVariables: (val: Record<string, FieldSpec>) => void;
    paramToVariableMap: Record<string, string>;
    setParamToVariableMap: (val: React.SetStateAction<Record<string, string>>) => void; // Allow functional update to match hook
    promotableParams: Array<{ nodeId: string; nodeLabel: string; paramName: string; spec: any }>;
};

export function SaveModuleModal({
    onClose,
    onSave,
    pendingModuleName,
    setPendingModuleName,
    pendingVariables,
    setPendingVariables,
    paramToVariableMap,
    setParamToVariableMap,
    promotableParams
}: SaveModuleModalProps) {
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 70,
                padding: 16,
            }}
        >
            <div
                style={{
                    background: "#0f1115",
                    border: "1px solid #222",
                    borderRadius: 10,
                    minWidth: 420,
                    maxWidth: 560,
                    maxHeight: "80vh",
                    padding: 16,
                    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ color: "#e6edf3", fontWeight: 700 }}>Save Module</span>
                    <button
                        onClick={onClose}
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "#888",
                            cursor: "pointer",
                            fontSize: 18,
                            lineHeight: 1,
                        }}
                        title="Close"
                    >
                        ×
                    </button>
                </div>
                <label style={{ color: "#cbd5e1", fontSize: 13, display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    Module name
                    <input
                        autoFocus
                        value={pendingModuleName}
                        onChange={e => setPendingModuleName(e.target.value)}
                        style={{
                            background: "#111",
                            border: "1px solid #333",
                            borderRadius: 6,
                            padding: "8px 10px",
                            color: "#e6edf3",
                            fontSize: 14,
                        }}
                    />
                </label>
                <div style={{ borderTop: "1px solid #333", paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                    <div style={{ flexShrink: 0 }}>
                        <h3 style={{ color: "#cbd5e1", fontSize: 14, margin: "0 0 10px" }}>Module Variables</h3>
                        {Object.entries(pendingVariables).map(([varName, spec]) => (
                            <div key={varName} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <input
                                    type="text"
                                    value={varName}
                                    onChange={() => { }} // Disabled renaming for simplicity as per original code comment or impl
                                    style={{
                                        background: "#111",
                                        border: "1px solid #333",
                                        borderRadius: 4,
                                        padding: "4px 6px",
                                        color: "#e6edf3",
                                        fontSize: 12,
                                    }}
                                />
                                <span style={{ color: '#888', fontSize: 12 }}>{spec.type}</span>
                                <button onClick={() => {
                                    const newVars = { ...pendingVariables };
                                    delete newVars[varName];
                                    setPendingVariables(newVars);
                                    // also remove from mappings
                                    setParamToVariableMap(map => {
                                        const newMap = { ...map };
                                        for (const key in newMap) {
                                            if (newMap[key] === varName) {
                                                delete newMap[key];
                                            }
                                        }
                                        return newMap;
                                    });
                                }} style={{ marginLeft: 'auto', background: '#333', border: '1px solid #555', color: '#ddd', borderRadius: 4, fontSize: 10 }}>Delete</button>
                            </div>
                        ))}
                        <button onClick={() => {
                            const newVarName = `var${Object.keys(pendingVariables).length + 1}`;
                            setPendingVariables({ ...pendingVariables, [newVarName]: { type: 'number', required: true } });
                        }} style={{ background: '#333', border: '1px solid #555', color: '#ddd', borderRadius: 4, fontSize: 10, padding: '4px 8px' }}>Add Variable</button>
                    </div>
                    <div style={{ borderTop: "1px solid #333", paddingTop: 12, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ color: "#cbd5e1", fontSize: 14, margin: "0 0 10px", flexShrink: 0 }}>Parameter Mappings</h3>
                        <div style={{ overflowY: "auto", paddingRight: 10 }}>
                            {promotableParams.map(({ nodeId, nodeLabel, paramName, spec }) => {
                                const key = `${nodeId}::${paramName}`;
                                const assignedVar = paramToVariableMap[key];
                                return (
                                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                        <span style={{ color: "#e6edf3", fontSize: 12, flex: 1 }}>{nodeLabel}: {spec.label || paramName}</span>
                                        <select
                                            value={assignedVar || ""}
                                            onChange={e => {
                                                const newVar = e.target.value;
                                                setParamToVariableMap(map => ({ ...map, [key]: newVar }));
                                                // if this is the first time a var is used, adopt the spec
                                                if (newVar && !pendingVariables[newVar]) {
                                                    setPendingVariables({ ...pendingVariables, [newVar]: spec });
                                                }
                                            }}
                                            style={{
                                                background: "#111",
                                                border: "1px solid #333",
                                                borderRadius: 4,
                                                padding: "4px 6px",
                                                color: "#e6edf3",
                                                fontSize: 12,
                                            }}
                                        >
                                            <option value="">Not Linked</option>
                                            {Object.keys(pendingVariables).map(varName => (
                                                <option key={varName} value={varName}>{varName}</option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4, flexShrink: 0 }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: "8px 12px",
                            background: "#333",
                            color: "#e6edf3",
                            border: "1px solid #444",
                            borderRadius: 6,
                            cursor: "pointer",
                        }}
                    >
                        Close
                    </button>
                    <button
                        onClick={onSave}
                        style={{
                            padding: "8px 12px",
                            background: "#1f8ecd",
                            color: "#fff",
                            border: "1px solid #1f8ecd",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontWeight: 600,
                        }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
