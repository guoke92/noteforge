import type { EditorSurfaceMode } from "../document/types";

/** Minimal editor store surface used by EditorHost (avoids runtime ↔ store cycle). */
export type EditorStoreHostSlice = {
  tabs: Array<{ id: string; surfaceMode?: EditorSurfaceMode }>;
  applySurfaceMode: (id: string, mode: EditorSurfaceMode) => void;
};

let accessor: (() => EditorStoreHostSlice) | null = null;

export function wireEditorStoreHost(getState: () => EditorStoreHostSlice): void {
  accessor = getState;
}

export function getEditorStoreHost(): EditorStoreHostSlice {
  if (!accessor) {
    return {
      tabs: [],
      applySurfaceMode: () => {},
    };
  }
  return accessor();
}

export function isEditorStoreHostWired(): boolean {
  return accessor !== null;
}
