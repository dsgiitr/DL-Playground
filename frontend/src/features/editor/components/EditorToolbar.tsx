import EditorHeader from "../../../components/HeaderUtils";
// Re-using existing EditorHeader component. It is complex and extracting it fully might be overkill given it is already a component.
// But we want to rename it/wrap it for semantic clarity in our new structure. 
// AND we need to pass all the props from our hooks.

export const EditorToolbar = EditorHeader;
// This is just a re-export for now, but in a real refactor we might want to move EditorHeader.tsx to this folder.
// For now, importing from `../../../components/HeaderUtils` is fine.
