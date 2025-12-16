import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import type { CodeSpan } from "../utils/dummy_generator";

type Props = {
    code: string;
    spans: CodeSpan[];
    onSelectionChange: (targets: { nodeIds: string[]; edgeIds: string[] }) => void;
    style?: React.CSSProperties;
};

export default function CodeViewer({ code, spans, onSelectionChange, style }: Props) {
    // Pre-split code for cheap rendering and span lookup.
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
                <div
                    key={line}
                    data-line={line}
                    style={{
                        fontFamily: "'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
                        fontSize: "inherit",
                        lineHeight: "inherit",
                        color: "#e6edf3"
                    }}
                >
                    {highlightPython(text)}
                </div>
            ))}
        </div>
    );
}

// Lightweight syntax highlighter for Pythonic code without extra deps.
const KEYWORDS = new Set([
    "import", "from", "class", "def", "return", "for", "while", "if", "elif", "else", "with", "as", "try", "except", "finally",
    "in", "is", "not", "and", "or", "pass", "None", "True", "False"
]);
const BUILTINS = new Set(["self", "torch", "nn", "range", "len"]);

// Palette tuned for dark background.
const COLORS = {
    text: "#e6edf3",
    keyword: "#c586c0",
    builtin: "#4fc1ff",
    string: "#ce9178",
    number: "#b5cea8",
    comment: "#6a9955"
};

function highlightPython(line: string) {
    const parts: Array<{ text: string; color?: string }> = [];
    let i = 0;
    const push = (text: string, color?: string) => parts.push({ text, color });

    const readWhile = (predicate: (c: string) => boolean) => {
        const start = i;
        while (i < line.length && predicate(line[i])) i++;
        return line.slice(start, i);
    };

    while (i < line.length) {
        const ch = line[i];
        // comments
        if (ch === "#") {
            push(line.slice(i), COLORS.comment);
            break;
        }
        // strings
        if (ch === '"' || ch === "'") {
            const quote = ch;
            let j = i + 1;
            while (j < line.length) {
                if (line[j] === "\\" && j + 1 < line.length) {
                    j += 2;
                    continue;
                }
                if (line[j] === quote) {
                    j++;
                    break;
                }
                j++;
            }
            push(line.slice(i, j), COLORS.string);
            i = j;
            continue;
        }
        // numbers
        if (/[0-9]/.test(ch)) {
            const num = readWhile(c => /[0-9._]/.test(c));
            push(num, COLORS.number);
            continue;
        }
        // identifiers / keywords
        if (/[A-Za-z_]/.test(ch)) {
            const ident = readWhile(c => /[A-Za-z0-9_]/.test(c));
            if (KEYWORDS.has(ident)) push(ident, COLORS.keyword);
            else if (BUILTINS.has(ident)) push(ident, COLORS.builtin);
            else push(ident, COLORS.text);
            continue;
        }
        // whitespace or symbols
        push(ch, COLORS.text);
        i++;
    }

    return parts.map((p, idx) => (
        <span key={idx} style={{ color: p.color }}>{p.text}</span>
    ));
}
