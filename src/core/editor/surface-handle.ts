import type { ContentPatch, CursorAnchor, EditorSurfaceMode, ScrollAnchor } from "../document/types";
import type { DocumentId } from "../events";

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

export function surfaceRegistrationKey(
  documentId: DocumentId,
  mode: EditorSurfaceMode,
): string {
  return `${documentId}:${mode}`;
}
