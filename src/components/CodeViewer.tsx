import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import type { CodeSpan } from "../utils/dummy_generator";

type Props = {
    code: string;
    spans: CodeSpan[];
    onSelectionChange: (targets: { nodeIds: string[]; edgeIds: string[] }) => void;
    style?: React.CSSProperties;
};

export default function CodeViewer({ code, spans, onSelectionChange, style }: Props) {
    const lines = useMemo(() => code.split("\n"), [code]);
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

    const lineMap = useMemo(() => {
        return lines.map((text, idx) => ({
            text,
            line: idx + 1
        }));
    }, [lines]);

    const findLine = (node: Node | null): number | null => {
        let current: Node | null = node;
        while (current) {
            if (current instanceof HTMLElement && current.dataset && current.dataset.line) {
                const n = Number(current.dataset.line);
                if (Number.isFinite(n)) return n;
            }
            current = current.parentNode as Node | null;
        }
        return null;
    };

    const handleMouseUp = (evt: ReactMouseEvent) => {
        const selection = window.getSelection();
        const selectionCollapsed = !selection || selection.isCollapsed;
        const startLine = selection ? findLine(selection.anchorNode) : null;
        const endLine = selection ? findLine(selection.focusNode) : null;
        const clickedLine = findLine(evt.target as Node);

        const lo = selectionCollapsed ? clickedLine : startLine !== null && endLine !== null ? Math.min(startLine, endLine) : null;
        const hi = selectionCollapsed ? clickedLine : startLine !== null && endLine !== null ? Math.max(startLine, endLine) : null;

        if (lo === null || hi === null) {
            onSelectionChange({ nodeIds: [], edgeIds: [] });
            return;
        }

        const nodeIds = new Set<string>();
        const edgeIds = new Set<string>();
        for (let line = lo; line <= hi; line++) {
            const entry = spanByLine.get(line);
            if (!entry) continue;
            entry.nodeIds.forEach(id => nodeIds.add(id));
            entry.edgeIds.forEach(id => edgeIds.add(id));
        }
        onSelectionChange({ nodeIds: Array.from(nodeIds), edgeIds: Array.from(edgeIds) });
    };

    return (
        <div
            style={{ ...style, whiteSpace: "pre", overflow: "auto" }}
            onMouseUp={handleMouseUp}
        >
            {lineMap.map(({ text, line }) => (
                <div key={line} data-line={line} style={{ fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit" }}>
                    {text}
                </div>
            ))}
        </div>
    );
}
