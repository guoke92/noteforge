import { syncSurfaceModeToDocument } from "../bridge/editor-sync";
import { getEditorStoreHost } from "../bridge/editor-store-bridge";
import type { EditorSurfaceMode } from "../document/types";
import type { DocumentId } from "../events";
import type { DocumentService } from "../document/service";
import { resolveSurfaceMode } from "@/lib/surface-mode";
import { normalizeSurfaceMode } from "../workbench/types";
import type { EditorHostService } from "./types";
import {
  type LiveSurfaceHandle,
  surfaceRegistrationKey,
} from "./surface-handle";

export function createEditorHostService(deps: {
  document: DocumentService;
}): EditorHostService {
  const { document } = deps;
  const handles = new Map<string, LiveSurfaceHandle>();

  function getActiveMode(documentId: DocumentId): EditorSurfaceMode {
    const tab = getEditorStoreHost().tabs.find((t) => t.id === documentId);
    if (!tab) return "write";
    return resolveSurfaceMode(tab);
  }

  function flushSurface(documentId: DocumentId, mode: EditorSurfaceMode): void {
    const handle = handles.get(surfaceRegistrationKey(documentId, mode));
    if (!handle) return;

    const patch = handle.flush();
    if (patch) {
      document.applyPatch(documentId, patch);
    }

    const captured = handle.captureViewState();
    if (captured.cursor || captured.scroll) {
      document.updateViewState(documentId, captured);
    }
  }

  async function setMode(documentId: DocumentId, mode: EditorSurfaceMode): Promise<void> {
    const normalized = normalizeSurfaceMode(mode);
    const tab = getEditorStoreHost().tabs.find((t) => t.id === documentId);
    if (!tab) return;

    const current = resolveSurfaceMode(tab);
    if (current === normalized) return;

    flushSurface(documentId, current);
    getEditorStoreHost().applySurfaceMode(documentId, normalized);
    syncSurfaceModeToDocument(documentId, normalized);
    document.updateViewState(documentId, { mode: normalized });
  }

  function registerSurface(
    documentId: DocumentId,
    mode: EditorSurfaceMode,
    handle: LiveSurfaceHandle,
  ): () => void {
    const key = surfaceRegistrationKey(documentId, mode);
    handles.set(key, handle);

    const doc = document.get(documentId);
    if (doc?.viewState) {
      const { cursor, scroll } = doc.viewState;
      if (cursor || scroll) {
        queueMicrotask(() => handle.restoreViewState({ cursor, scroll }));
      }
    }

    return () => {
      if (handles.get(key) === handle) handles.delete(key);
    };
  }

  function revealLine(documentId: DocumentId, line: number): boolean {
    const mode = getActiveMode(documentId);
    const handle = handles.get(surfaceRegistrationKey(documentId, mode));
    return handle?.revealLine(line) ?? false;
  }

  function applyExternalContent(documentId: DocumentId, content: string): void {
    const mode = getActiveMode(documentId);
    const handle = handles.get(surfaceRegistrationKey(documentId, mode));
    handle?.applyExternalContent(content);
  }

  return {
    getActiveMode,
    setMode,
    registerAdapter() {
      return () => {};
    },
    registerSurface,
    revealLine,
    applyExternalContent,
    flushSurface,
  };
}

export type EditorHostServiceImpl = ReturnType<typeof createEditorHostService> & {
  registerSurface: (
    documentId: DocumentId,
    mode: EditorSurfaceMode,
    handle: LiveSurfaceHandle,
  ) => () => void;
  revealLine: (documentId: DocumentId, line: number) => boolean;
  applyExternalContent: (documentId: DocumentId, content: string) => void;
  flushSurface: (documentId: DocumentId, mode: EditorSurfaceMode) => void;
};
