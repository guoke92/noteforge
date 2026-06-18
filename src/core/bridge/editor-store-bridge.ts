import type { EditorSurfaceMode } from "../document/types";
import { MAIN_PANE_ID } from "./tab-pane-utils";

/** Minimal editor store surface used by EditorHost (avoids runtime ↔ store cycle). */
export type EditorStoreHostSlice = {
  tabs: Array<{ id: string; documentId: string; surfaceMode?: EditorSurfaceMode }>;
  activePaneId: string;
  activeTabIdByPane: Record<string, string | undefined>;
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
      activePaneId: MAIN_PANE_ID,
      activeTabIdByPane: {},
      applySurfaceMode: () => {},
    };
  }
  return accessor();
}

export function isEditorStoreHostWired(): boolean {
  return accessor !== null;
}
