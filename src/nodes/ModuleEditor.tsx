type Props = {
  moduleId: string;
};

export function ModuleEditor({ moduleId }: Props) {
  return (
    <div style={{ padding: 12, color: "#e5e7eb" }}>
      <h3>Module Editor</h3>
      <p>
        Editing module: <b>{moduleId}</b>
      </p>
      <button
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent("module-open", {
              detail: { moduleId: "child-module-id" },
            })
          );
        }}
      >
        Open Child Module
      </button>
    </div>
  );
}
