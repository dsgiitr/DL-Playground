import { useEffect, useState } from "react";

export function useGraphLayout() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(240);
    const [codePanelWidth, setCodePanelWidth] = useState(360);
    const [dragSidebar, setDragSidebar] = useState(false);
    const [dragCodePanel, setDragCodePanel] = useState(false);
    const [showLiveCode, setShowLiveCode] = useState(false);

    // Modal/Panel visibility states
    const [showDiagram, setShowDiagram] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [showComputePanel, setShowComputePanel] = useState(false);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);

    // Sidebar resize
    useEffect(() => {
        if (!dragSidebar) return;
        const onMove = (ev: MouseEvent) => {
            const newWidth = Math.min(400, Math.max(160, ev.clientX));
            setSidebarWidth(newWidth);
        };
        const onUp = () => setDragSidebar(false);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [dragSidebar]);

    // Code panel resize
    useEffect(() => {
        if (!dragCodePanel) return;
        const onMove = (ev: MouseEvent) => {
            const viewportWidth = document.documentElement.clientWidth;
            const activeSidebarWidth = sidebarCollapsed ? 48 : sidebarWidth;
            const minCanvasWidth = 320;
            const maxWidth = Math.max(260, viewportWidth - activeSidebarWidth - minCanvasWidth);
            const newWidth = Math.min(maxWidth, Math.max(260, viewportWidth - ev.clientX));
            setCodePanelWidth(newWidth);
        };
        const onUp = () => setDragCodePanel(false);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [dragCodePanel, sidebarCollapsed, sidebarWidth]);

    return {
        sidebarCollapsed, setSidebarCollapsed,
        sidebarWidth, setSidebarWidth,
        codePanelWidth, setCodePanelWidth,
        dragSidebar, setDragSidebar,
        dragCodePanel, setDragCodePanel,
        showLiveCode, setShowLiveCode,
        showDiagram, setShowDiagram,
        showDiagnostics, setShowDiagnostics,
        showComputePanel, setShowComputePanel,
        exportMenuOpen, setExportMenuOpen
    };
}
