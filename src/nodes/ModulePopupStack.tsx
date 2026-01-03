import { useModuleStack } from "./UseModuleStack";
import { ModuleEditor } from "./ModuleEditor";

export function ModulePopupStack() {
  const { stack, close } = useModuleStack();

  return (
    <>
      {stack.map((popup, index) => (
        <div
          key={popup.id}
          style={{
            position: "fixed",
            top: 80 + index * 30,
            left: 80 + index * 30,
            width: 420,
            height: 300,
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 12,
            zIndex: 1000 + index,
            boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
          }}
        >
          <Header
            title={popup.moduleId}
            onClose={() => close(popup.id)}
          />
          <ModuleEditor moduleId={popup.moduleId} />
        </div>
      ))}
    </>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid #334155",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "grab",
      }}
    >
      <strong>{title}</strong>
      <button onClick={onClose}>✕</button>
    </div>
  );
}
