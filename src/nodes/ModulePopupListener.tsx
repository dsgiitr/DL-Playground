import { useEffect } from "react";
import { useModuleStack } from "./UseModuleStack";

export function ModulePopupListener() {
  const open = useModuleStack(s => s.open);

useEffect(() => {
  const handler = (e: Event) => {
    const { moduleId } = (e as CustomEvent).detail;
    if (!moduleId) return;

    open({ id: crypto.randomUUID(), moduleId });
  };

  window.addEventListener("module-open", handler);
  return () => window.removeEventListener("module-open", handler);
}, [open]);


  return null;
}


