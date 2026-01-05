import type { Edge, Node } from "@xyflow/react";
import type { GraphIR } from "../types/graph";

export type ModuleHandles = {
    inputs: string[];
    outputs: string[];
    // internal nodes 
    // internal edges 
    // external reference: [ids]
};

export type SavedModule = {
    id: string;
    name: string;
    version: string;
    graph: GraphIR;
    handles: ModuleHandles;
    internalNodes?: Node[];
    internalEdges?: Edge[];
    description?: string;
    createdAt: string;
    updatedAt: string;
};

const STORAGE_KEY = "customModules";

type RawSavedModule = Omit<SavedModule, "handles"> & {
    handles?: ModuleHandles;
    contract?: ModuleHandles;
};

function normalizeModule(mod: RawSavedModule): SavedModule {
    const { handles, contract, ...rest } = mod;
    const resolved = handles || contract || { inputs: ["in"], outputs: ["out"] };
    return {
        ...(rest as Omit<SavedModule, "handles">),
        handles: {
            inputs: dedupeHandles(resolved.inputs || ["in"]),
            outputs: dedupeHandles(resolved.outputs || ["out"]),
        },
    };
}

function safeParse(raw: string | null): SavedModule[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return (parsed as RawSavedModule[]).map(normalizeModule);
    } catch (err) {
        console.warn("Failed to parse saved modules", err);
        return [];
    }
}

function persist(mods: SavedModule[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mods));
    } catch (err) {
        console.warn("Failed to persist modules", err);
    }
}

function loadAll(): SavedModule[] {
    if (typeof localStorage === "undefined") return [];
    return safeParse(localStorage.getItem(STORAGE_KEY));
}

function dedupeHandles(handles: string[]) {
    return Array.from(new Set(handles.filter(Boolean)));
}

export function listModules(): SavedModule[] {
    return loadAll();
}

export function getModule(id: string): SavedModule | undefined {
    return loadAll().find(m => m.id === id);
}

export function deleteModule(id: string) {
    const filtered = loadAll().filter(m => m.id !== id);
    persist(filtered);
}

export function saveModule(moduleInput: Omit<SavedModule, "id" | "createdAt" | "updatedAt"> & { id?: string }): SavedModule {
    const now = new Date().toISOString();
    // subgraph traveral: find custom 
    const next: SavedModule = {
        ...moduleInput,
        id: moduleInput.id || `mod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: now,
        updatedAt: now,
        handles: {
            inputs: dedupeHandles(moduleInput.handles.inputs || ["in"]),
            outputs: dedupeHandles(moduleInput.handles.outputs || ["out"]),
        },
    };

    const existing = loadAll();
    const idx = existing.findIndex(m => m.id === next.id);
    if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...next, createdAt: existing[idx].createdAt, updatedAt: now };
        persist(existing);
        return existing[idx];
    }
    const merged = [...existing, next];
    persist(merged);
    return next;
}
