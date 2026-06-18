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
  const handleDocumentIds = new Map<string, DocumentId>();

  function findTabById(tabId: string) {
    return getEditorStoreHost().tabs.find((t) => t.id === tabId);
  }

  function tabsForDocument(documentId: DocumentId) {
    return getEditorStoreHost().tabs.filter((t) => t.documentId === documentId);
  }

  function getActiveMode(documentId: DocumentId): EditorSurfaceMode {
    const tab = tabsForDocument(documentId)[0];
    if (!tab) return "write";
    return resolveSurfaceMode(tab);
  }

  function flushSurface(tabId: string, mode: EditorSurfaceMode): void {
    const key = surfaceRegistrationKey(tabId, mode);
    const handle = handles.get(key);
    const documentId = handleDocumentIds.get(key);
    if (!handle || !documentId) return;

    const patch = handle.flush();
    if (patch) {
      document.applyPatch(documentId, patch);
    }

    const captured = handle.captureViewState();
    if (captured.cursor || captured.scroll) {
      document.updateViewState(documentId, captured);
    }
  }

  function flushAllSurfacesForDocument(documentId: DocumentId): void {
    for (const tab of tabsForDocument(documentId)) {
      flushSurface(tab.id, resolveSurfaceMode(tab));
    }
  }

  async function setMode(tabId: string, mode: EditorSurfaceMode): Promise<void> {
    const normalized = normalizeSurfaceMode(mode);
    const tab = findTabById(tabId);
    if (!tab) return;

    const current = resolveSurfaceMode(tab);
    if (current === normalized) return;

    flushSurface(tabId, current);
    getEditorStoreHost().applySurfaceMode(tabId, normalized);
    syncSurfaceModeToDocument(tabId, normalized);
    document.updateViewState(tab.documentId, { mode: normalized });
  }

  function registerSurface(
    tabId: string,
    documentId: DocumentId,
    mode: EditorSurfaceMode,
    handle: LiveSurfaceHandle,
  ): () => void {
    const key = surfaceRegistrationKey(tabId, mode);
    handles.set(key, handle);
    handleDocumentIds.set(key, documentId);

    const doc = document.get(documentId);
    if (doc?.viewState) {
      const { cursor, scroll } = doc.viewState;
      if (cursor || scroll) {
        queueMicrotask(() => handle.restoreViewState({ cursor, scroll }));
      }
    }

    return () => {
      if (handles.get(key) === handle) {
        const patch = handle.flush();
        if (patch) {
          document.applyPatch(documentId, patch);
        }
        const captured = handle.captureViewState();
        if (captured.cursor || captured.scroll) {
          document.updateViewState(documentId, captured);
        }
        handles.delete(key);
        handleDocumentIds.delete(key);
      }
    };
  }

  function revealLine(documentId: DocumentId, line: number): boolean {
    const activePaneId = getEditorStoreHost().activePaneId;
    const activeTabId = getEditorStoreHost().activeTabIdByPane[activePaneId];
    const tab =
      (activeTabId
        ? tabsForDocument(documentId).find((t) => t.id === activeTabId)
        : undefined) ?? tabsForDocument(documentId)[0];
    if (!tab) return false;

    const mode = resolveSurfaceMode(tab);
    const handle = handles.get(surfaceRegistrationKey(tab.id, mode));
    return handle?.revealLine(line) ?? false;
  }

  function applyExternalContent(documentId: DocumentId, content: string): void {
    for (const [key, handle] of handles) {
      if (handleDocumentIds.get(key) === documentId) {
        handle.applyExternalContent(content);
      }
    }
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
    flushAllSurfacesForDocument,
  };
}

export type EditorHostServiceImpl = ReturnType<typeof createEditorHostService> & {
  registerSurface: (
    tabId: string,
    documentId: DocumentId,
    mode: EditorSurfaceMode,
    handle: LiveSurfaceHandle,
  ) => () => void;
  revealLine: (documentId: DocumentId, line: number) => boolean;
  applyExternalContent: (documentId: DocumentId, content: string) => void;
  flushSurface: (tabId: string, mode: EditorSurfaceMode) => void;
  flushAllSurfacesForDocument: (documentId: DocumentId) => void;
};
