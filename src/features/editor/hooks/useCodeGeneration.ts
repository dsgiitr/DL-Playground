import type { Edge, Node } from "@xyflow/react";
import { useCallback, useMemo } from "react";
import { getRootGraph, recursiveCodeGenerator } from "../../../utils/codeCompile";

export function useCodeGeneration(nodes: Node[], edges: Edge[]) {
    const generated = useMemo(() => {
        const { rootNodes, rootEdges } = getRootGraph(nodes, edges);
        return recursiveCodeGenerator(rootNodes, rootEdges);
    }, [nodes, edges]);

    const generatedCode = generated.code;

    const onDownloadCode = useCallback(() => {
        const blob = new Blob([generatedCode], { type: "text/x-python" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "generated_model.py";
        a.click();
        URL.revokeObjectURL(url);
    }, [generatedCode]);

    return {
        generated,
        generatedCode,
        onDownloadCode
    }
}
