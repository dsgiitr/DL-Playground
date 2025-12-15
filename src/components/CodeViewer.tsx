import React, { useMemo, useRef, useEffect, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { CodeSpan } from "../utils/dummy_generator";

type Props = {
    code: string;
    spans: CodeSpan[];
    onSelectionChange: (targets: { nodeIds: string[]; edgeIds: string[] }) => void;
    style?: React.CSSProperties;
    language?: string; 
};

export default function CodeViewer({ 
    code, 
    spans, 
    onSelectionChange, 
    style, 
    language = "python" 
}: Props) {
    
    const [localCode, setLocalCode] = useState(code);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        if (!isDirty) {
            setLocalCode(code);
        }
    }, [code, isDirty]);

    const handleEditorChange = (value: string | undefined) => {
        setLocalCode(value || "");
        setIsDirty(true);
    };

    const handleReset = () => {
        setLocalCode(code);
        setIsDirty(false);
    };

    const spanByLine = useMemo(() => {
        const map = new Map<number, { nodeIds: Set<string>; edgeIds: Set<string> }>();
        spans.forEach(span => {
            const entry = map.get(span.line) || { nodeIds: new Set<string>(), edgeIds: new Set<string>() };
            if (span.nodeId) entry.nodeIds.add(span.nodeId);
            (span.edgeIds || []).forEach(eid => entry.edgeIds.add(eid));
            map.set(span.line, entry);
        });
        return map;
    }, [spans]);

    const spanByLineRef = useRef(spanByLine);
    const onSelectionChangeRef = useRef(onSelectionChange);

    useEffect(() => { spanByLineRef.current = spanByLine; }, [spanByLine]);
    useEffect(() => { onSelectionChangeRef.current = onSelectionChange; }, [onSelectionChange]);

    const handleEditorDidMount: OnMount = (editorInstance) => {
        editorInstance.onDidChangeCursorSelection((e) => {
            const selection = e.selection;
            const startLine = selection.startLineNumber;
            const endLine = selection.endLineNumber;
            const lo = Math.min(startLine, endLine);
            const hi = Math.max(startLine, endLine);

            const nodeIds = new Set<string>();
            const edgeIds = new Set<string>();
            const currentSpanMap = spanByLineRef.current;

            for (let line = lo; line <= hi; line++) {
                const entry = currentSpanMap.get(line);
                if (!entry) continue;
                entry.nodeIds.forEach(id => nodeIds.add(id));
                entry.edgeIds.forEach(id => edgeIds.add(id));
            }

            onSelectionChangeRef.current({ 
                nodeIds: Array.from(nodeIds), 
                edgeIds: Array.from(edgeIds) 
            });
        });
    };

    return (
        <div 
            style={{ ...style, overflow: "hidden", position: "relative" }}
            onKeyDown={(e) => e.stopPropagation()} 
        >
            {isDirty && (
                <button
                    onClick={handleReset}
                    style={{
                        position: "absolute",
                        top: 10,
                        right: 20,
                        zIndex: 10,
                        padding: "4px 8px",
                        background: "#2d2d2d",
                        color: "#ff6b6b",
                        border: "1px solid #ff6b6b",
                        borderRadius: "4px",
                        fontSize: "12px",
                        cursor: "pointer",
                        opacity: 0.9
                    }}
                    title="Discard manual changes and sync with graph"
                >
                    Reset to Graph
                </button>
            )}

            <Editor
                height="100%"
                width="100%"
                language={language}
                value={localCode}
                onChange={handleEditorChange}
                theme="vs-dark" 
                options={{
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    renderLineHighlight: "all",
                    contextmenu: false, 
                    fontFamily: "inherit", 
                    fontSize: 14,
                    fixedOverflowWidgets: true,
                    quickSuggestions: true,
                    suggest: {
                        preview: true,
                        showWords: false
                    }
                }}
                onMount={handleEditorDidMount}
            />
        </div>
    );
}
