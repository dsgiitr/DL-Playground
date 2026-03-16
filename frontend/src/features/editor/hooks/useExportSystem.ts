import { useState, useCallback } from "react";
import { useReactFlow, getNodesBounds, getViewportForBounds, type Node, type Edge } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import type { SavedModule } from "../../../utils/moduleRegistry";

interface UseExportSystemProps {
    nodes: Node[];
    edges: Edge[];
    modules: SavedModule[];
}

export function useExportSystem({ nodes, edges, modules }: UseExportSystemProps) {
    const { getNodes } = useReactFlow();
    const [isExporting, setIsExporting] = useState(false);

    // Helper to download a file
    const downloadFile = (dataUrl: string, filename: string) => {
        const a = document.createElement("a");
        a.setAttribute("download", filename);
        a.setAttribute("href", dataUrl);
        a.click();
    };

    // Helper to calculate the bounds of the graph for image export
    const getGraphBounds = () => {
        const currentNodes = getNodes();
        if (currentNodes.length === 0) return null;
        
        const nodesBounds = getNodesBounds(currentNodes);
        const viewport = getViewportForBounds(
            nodesBounds,
            nodesBounds.width,
            nodesBounds.height,
            0.5,
            2, 0
        );
        return { width: nodesBounds.width, height: nodesBounds.height, viewport };
    };

    const exportJson = useCallback(() => {
        console.log("exporting json")
        try {
            setIsExporting(true);
            // Assuming buildGraphIR returns the format you want to save
            ;
            const exportData = {
                nodes: nodes,
                edges: edges,
                modules: modules
            }
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
            downloadFile(dataStr, "dl-playground-model.json");
        } catch (error) {
            console.error("Failed to export JSON:", error);
            alert("Failed to export graph to JSON.");
        } finally {
            setIsExporting(false);
        }
    }, [nodes, edges]);

    const exportPng = useCallback(async () => {
        console.log("exporting json")
        const element = document.querySelector(".react-flow__viewport") as HTMLElement;
        if (!element) return;

        try {
            setIsExporting(true);
            const bounds = getGraphBounds();
            if (!bounds) throw new Error("No nodes to export");

            const dataUrl = await toPng(element, {
                backgroundColor: "#1a1a2e", // Change to match your canvas background
                width: bounds.width,
                height: bounds.height,
                style: {
                    width: `${bounds.width}px`,
                    height: `${bounds.height}px`,
                    transform: `translate(${bounds.viewport.x}px, ${bounds.viewport.y}px) scale(${bounds.viewport.zoom})`,
                },
            });
            downloadFile(dataUrl, "dl-playground-model.png");
        } catch (error) {
            console.error("Failed to export PNG:", error);
            alert("Failed to export graph to PNG.");
        } finally {
            setIsExporting(false);
        }
    }, [getNodes]);

    const exportSvg = useCallback(async () => {
        console.log("exporting svg")
        const element = document.querySelector(".react-flow__viewport") as HTMLElement;
        if (!element) return;

        try {
            setIsExporting(true);
            const bounds = getGraphBounds();
            if (!bounds) throw new Error("No nodes to export");

            const dataUrl = await toSvg(element, {
                backgroundColor: "#1a1a2e", // Change to match your canvas background
                width: bounds.width,
                height: bounds.height,
                style: {
                    width: `${bounds.width}px`,
                    height: `${bounds.height}px`,
                    transform: `translate(${bounds.viewport.x}px, ${bounds.viewport.y}px) scale(${bounds.viewport.zoom})`,
                },
            });
            downloadFile(dataUrl, "dl-playground-model.svg");
        } catch (error) {
            console.error("Failed to export SVG:", error);
            alert("Failed to export graph to SVG.");
        } finally {
            setIsExporting(false);
        }
    }, [getNodes]);

    return {
        exportJson,
        exportPng,
        exportSvg,
        isExporting
    };
}