import type { GraphIR } from "../types/graph";
import { layoutDiagramWithElk, type LayoutDirection } from "./layout";
import { projectGraphToDiagram } from "./diagramProjector";

type DiagramEdgeSection = Array<{ x: number; y: number }>;

type DiagramLayout = Awaited<ReturnType<typeof layoutDiagramWithElk>>;

function classifyKind(label: string) {
    const lower = label.toLowerCase();
    if (lower.includes("input")) return "input";
    if (lower.includes("output")) return "output";
    if (lower.includes("add") || lower.includes("merge") || lower.includes("concat")) return "merge";
    if (lower.includes("relu") || lower.includes("gelu") || lower.includes("sigmoid") || lower.includes("tanh")) return "activation";
    if (lower.includes("conv") || lower.includes("linear") || lower.includes("dense") || lower.includes("attention") || lower.includes("lstm") || lower.includes("gru")) return "block";
    return "other";
}

function edgePath(sections: DiagramEdgeSection[]) {
    const points = sections.flat();
    if (points.length < 2) return "";
    const [first, ...rest] = points;
    return `M ${first.x} ${first.y} ` + rest.map(p => `L ${p.x} ${p.y}`).join(" ");
}

function renderNodeShape(n: DiagramLayout["nodes"][number]) {
    const kind = n.kind ?? classifyKind(n.label);
    const centerX = n.width / 2;
    const centerY = n.height / 2;
    if (kind === "input" || kind === "output") {
        return `<rect x="0" y="0" rx="${n.height / 2}" ry="${n.height / 2}" width="${n.width}" height="${n.height}" fill="#f5f7fb" stroke="#0f172a" stroke-width="1.5" />`;
    }
    if (kind === "merge") {
        const size = Math.min(n.width, n.height);
        const half = size / 2 - 2;
        return `<g transform="translate(${centerX}, ${centerY})"><polygon points="0,-${half} ${half},0 0,${half} -${half},0" fill="#f5f7fb" stroke="#0f172a" stroke-width="1.5" /></g>`;
    }
    if (kind === "activation") {
        const r = Math.min(n.width, n.height) / 2 - 6;
        return `<g transform="translate(${centerX}, ${centerY})"><circle r="${r}" fill="#f5f7fb" stroke="#0f172a" stroke-width="1.5" /></g>`;
    }
    return `<rect x="0" y="0" rx="8" ry="8" width="${n.width}" height="${n.height}" fill="#f5f7fb" stroke="#0f172a" stroke-width="1.5" />`;
}

function renderDiagramSvg(layout: DiagramLayout) {
    const padding = 40;
    const totalWidth = layout.width + padding * 2;
    const totalHeight = layout.height + padding * 2;
    const nodesSvg = layout.nodes
        .map(n => {
            const shape = renderNodeShape(n);
            const centerX = n.width / 2;
            const centerY = n.height / 2;
            return `<g transform="translate(${n.x + padding}, ${n.y + padding})">${shape}<text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, sans-serif" font-size="14" fill="#0f172a" font-weight="600">${n.label}</text></g>`;
        })
        .join("");

    const edgesSvg = layout.edges
        .map(e => {
            const d = edgePath(e.sections);
            if (!d) return "";
            return `<path d="${d}" fill="none" stroke="#0f172a" stroke-width="2" marker-end="url(#arrow)" />`;
        })
        .join("");

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" style="background:#ffffff">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" fill="#0f172a">
      <path d="M 0 0 L 10 5 L 0 10 z" />
    </marker>
  </defs>
  <g transform="translate(${padding}, ${padding})">
    <g class="edges">${edgesSvg}</g>
    <g class="nodes">${nodesSvg}</g>
  </g>
</svg>`.trim();
}

async function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                URL.revokeObjectURL(url);
                return reject(new Error("Canvas unsupported"));
            }
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/png");
            URL.revokeObjectURL(url);
            resolve(dataUrl);
        };
        img.onerror = err => {
            URL.revokeObjectURL(url);
            reject(err);
        };
        img.src = url;
    });
}

export async function exportDiagramDataUrl(
    graph: GraphIR,
    format: "svg" | "png",
    direction: LayoutDirection = "LR"
) {
    const { nodes, edges } = projectGraphToDiagram(graph);
    const layout = await layoutDiagramWithElk(nodes, edges, direction);
    const svgString = renderDiagramSvg(layout);
    const padding = 40;
    const totalWidth = layout.width + padding * 2;
    const totalHeight = layout.height + padding * 2;

    if (format === "svg") {
        return {
            dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`,
            width: totalWidth,
            height: totalHeight,
        };
    }

    const dataUrl = await svgToPngDataUrl(svgString, totalWidth, totalHeight);
    return { dataUrl, width: totalWidth, height: totalHeight };
}
