import { create } from "zustand";

export type ModulePopup = {
  id: string;
  moduleId: string;
};

type StackState = {
  stack: ModulePopup[];
  open: (popup: ModulePopup) => void;
  close: (id: string) => void;
  closeTop: () => void;
};

export const useModuleStack = create<StackState>(set => ({
  stack: [],
  open: popup =>
    set(state => ({
      stack: [...state.stack, popup],
    })),
  close: id =>
    set(state => ({
      stack: state.stack.filter(p => p.id !== id),
    })),
  closeTop: () =>
    set(state => ({
      stack: state.stack.slice(0, -1),
    })),
}));
