import type { ContentPatch, CursorAnchor, EditorSurfaceMode, ScrollAnchor } from "../document/types";

/** Runtime binding registered by an active editor surface (React mount). */
export interface LiveSurfaceHandle {
  mode: EditorSurfaceMode;
  flush(): ContentPatch | null;
  revealLine(line: number): boolean;
  applyExternalContent(content: string): void;
  focus(): void;
  captureViewState(): {
    cursor?: CursorAnchor;
    scroll?: ScrollAnchor;
  };
  restoreViewState(state: {
    cursor?: CursorAnchor;
    scroll?: ScrollAnchor;
  }): void;
}

/** Unique per tab slot — split panes may share one documentId. */
export function surfaceRegistrationKey(
  tabId: string,
  mode: EditorSurfaceMode,
): string {
  return `${tabId}:${mode}`;
}
