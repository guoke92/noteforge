import type { DocumentId } from "../events";
import type { ContentPatch, CursorAnchor, EditorSurfaceMode, ViewState } from "../document/types";
import type { LiveSurfaceHandle } from "./surface-handle";

/**
 * Phase 1+: Editor Host routes surfaces. Phase 0 defines contract only.
 * ADR-005: Surfaces never own canonical content — they emit patches upward.
 *
 * Surface modes:
 * - write: Milkdown WYSIWYG (default)
 * - source: Monaco markdown source
 * - read: same adapter as write with readOnly=true (no separate preview stack)
 */

export interface EditorSurfaceProps {
  documentId: DocumentId;
  mode: EditorSurfaceMode;
  /** true when mode === "read" — write surface in presentation / no-edit mode */
  readOnly?: boolean;
}

/** Binding exposed by any surface for navigation sync (outline, backlinks). */
export interface EditorSurfaceHandle {
  focus(): void;
  revealLine(line: number): void;
  getCursor(): CursorAnchor | null;
  getScrollRatio(): number;
  setScrollRatio(ratio: number): void;
}

export interface EditorSurfaceAdapter {
  mode: EditorSurfaceMode;
  mount(container: HTMLElement, props: EditorSurfaceProps): EditorSurfaceHandle;
  unmount(): void;
  /** ADR-005: Called before switching away — must flush pending edits as patch. */
  flush(): ContentPatch | null;
  applyExternalContent(content: string, preserveView?: Partial<ViewState>): void;
}

export interface EditorHostService {
  getActiveMode(documentId: DocumentId): EditorSurfaceMode;
  setMode(tabId: string, mode: EditorSurfaceMode): Promise<void>;
  /** @deprecated Phase-1 adapters — surfaces register LiveSurfaceHandle directly. */
  registerAdapter(adapter: EditorSurfaceAdapter): () => void;
  registerSurface(
    tabId: string,
    documentId: DocumentId,
    mode: EditorSurfaceMode,
    handle: LiveSurfaceHandle,
  ): () => void;
  revealLine(documentId: DocumentId, line: number): boolean;
  applyExternalContent(documentId: DocumentId, content: string): void;
  flushSurface(tabId: string, mode: EditorSurfaceMode): void;
  flushAllSurfacesForDocument(documentId: DocumentId): void;
}

/** ADR-005: Mode switch protocol — enforced by EditorHost implementation. */
export interface ModeSwitchPlan {
  from: EditorSurfaceMode;
  to: EditorSurfaceMode;
  steps: Array<
    | { action: "flush-surface" }
    | { action: "apply-content-to-document" }
    | { action: "mount-surface" }
    | { action: "restore-view-state" }
  >;
}
