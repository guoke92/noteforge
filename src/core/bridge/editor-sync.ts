import {
  isMainPane,
  useEditorStore,
  type EditorTab,
} from "@/store/editor";
import { isMarkdownTab, nextUntitledDisplayName } from "@/lib/editor-doc";
import { basename, detectLanguageFromName } from "@/lib/utils";
import type { DocumentRecord } from "../document/types";
import type { EditorSurfaceMode } from "../document/types";
import type { PersistedTabRef } from "../workbench/types";
import { normalizeSurfaceMode } from "../workbench/types";
import { getCore } from "../runtime";
import { newTabSlotId } from "./tab-id";
import { DEFERRED_DOCUMENT_ID_PREFIX, remapActiveTabsAfterClose } from "./tab-pane-utils";
import {
  createEphemeralFromScratchRestore,
  loadScratchRestoreData,
} from "../session/scratch-restore";
import { perfAsync, perfLog } from "@/lib/startup-perf";

export function documentToEditorTab(
  doc: DocumentRecord,
  paneId: string,
  panes: string[],
): EditorTab {
  const isMd = isMarkdownTab({
    kind: doc.vaultPath ? "workspace" : "scratch",
    path: doc.vaultPath ?? "",
    language: doc.language,
  });
  const surfaceMode = doc.viewState.mode;

  if (doc.vaultPath) {
    return {
      id: newTabSlotId(),
      documentId: doc.id,
      kind: "workspace",
      path: doc.vaultPath,
      displayName: doc.title || basename(doc.vaultPath),
      language: doc.language,
      bufferRevision: doc.revision,
      savedRevision: doc.savedRevision,
      paneId,
      surfaceMode: isMd ? surfaceMode : "source",
      openedInSplit: !isMainPane(paneId, panes),
    };
  }

  const existingScratchTabs = useEditorStore
    .getState()
    .tabs.filter((t) => t.kind === "scratch");
  const displayName =
    doc.title.trim() || nextUntitledDisplayName(existingScratchTabs);

  return {
    id: newTabSlotId(),
    documentId: doc.id,
    kind: "scratch",
    scratchId: doc.id,
    path: "",
    displayName,
    language: doc.language,
    bufferRevision: doc.revision,
    savedRevision: doc.savedRevision,
    paneId,
    surfaceMode: isMd ? surfaceMode : "source",
    openedInSplit: !isMainPane(paneId, panes),
  };
}

/** Push metadata (not content) into all editor tabs bound to this document. */
export function syncDocumentToEditorTabs(doc: DocumentRecord): void {
  const state = useEditorStore.getState();

  useEditorStore.setState({
    tabs: state.tabs.map((t) => {
      if (t.documentId !== doc.id) return t;
      const surfaceMode = doc.viewState.mode;
      const isMd = isMarkdownTab({
        kind: doc.vaultPath ? "workspace" : "scratch",
        path: doc.vaultPath ?? t.path,
        language: doc.language,
      });
      if (doc.vaultPath) {
        return {
          ...t,
          kind: "workspace" as const,
          path: doc.vaultPath,
          scratchId: undefined,
          displayName: doc.title || basename(doc.vaultPath),
          language: doc.language,
          bufferRevision: doc.revision,
          savedRevision: doc.savedRevision,
          surfaceMode: isMd ? surfaceMode : "source",
        };
      }
      return {
        ...t,
        language: doc.language,
        bufferRevision: doc.revision,
        savedRevision: doc.savedRevision,
      };
    }),
  });
}

/** Push content into all editor surfaces for this document (revert / external changes). */
export function pushContentToSurface(doc: DocumentRecord): void {
  if (!doc.contentLoaded) return;
  getCore().editorHost.applyExternalContent(doc.id, doc.content);
}

/** Apply content to DocumentService and live editor surfaces (format, tree actions). */
export function applyContentToDocument(documentId: string, content: string): void {
  getCore().document.applyPatch(documentId, { kind: "replace-all", content });
  getCore().editorHost.applyExternalContent(documentId, content);
}

/** Tab shell for session restore — document opens on first activation. */
export function mountDeferredTabShell(tabRef: PersistedTabRef, paneId: string): string {
  const state = useEditorStore.getState();
  const tabId = newTabSlotId();
  const surfaceMode = normalizeSurfaceMode(tabRef.viewState?.mode);
  const deferredDocumentId = `${DEFERRED_DOCUMENT_ID_PREFIX}${tabId}`;

  if (tabRef.vaultPath) {
    const language = detectLanguageFromName(basename(tabRef.vaultPath)) || "plaintext";
    const isMd = isMarkdownTab({
      kind: "workspace",
      path: tabRef.vaultPath,
      language,
    });
    const tab: EditorTab = {
      id: tabId,
      documentId: deferredDocumentId,
      kind: "workspace",
      path: tabRef.vaultPath,
      displayName: basename(tabRef.vaultPath),
      language,
      bufferRevision: 0,
      savedRevision: 0,
      paneId,
      surfaceMode: isMd ? surfaceMode : "source",
      openedInSplit: !isMainPane(paneId, state.panes),
      pendingRestore: tabRef,
    };
    useEditorStore.setState({ tabs: [...state.tabs, tab] });
    return tabId;
  }

  const title = tabRef.ephemeral?.title ?? "Untitled";
  const language = tabRef.ephemeral?.language ?? "markdown";
  const isMd = isMarkdownTab({ kind: "scratch", path: "", language });
  const tab: EditorTab = {
    id: tabId,
    documentId: deferredDocumentId,
    kind: "scratch",
    scratchId: tabRef.scratchId,
    path: "",
    displayName: title,
    language,
    bufferRevision: 0,
    savedRevision: 0,
    paneId,
    surfaceMode: isMd ? surfaceMode : "source",
    openedInSplit: !isMainPane(paneId, state.panes),
    pendingRestore: tabRef,
  };
  useEditorStore.setState({ tabs: [...state.tabs, tab] });
  return tabId;
}

export async function hydrateDeferredTab(tabId: string): Promise<void> {
  return perfAsync("editor.hydrateDeferredTab", async () => {
  const state = useEditorStore.getState();
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab?.pendingRestore) {
    perfLog("editor.hydrateDeferredTab skipped (no pendingRestore)", { tabId });
    return;
  }

  perfLog("editor.hydrateDeferredTab.start", {
    tabId,
    displayName: tab.displayName,
    vaultPath: tab.pendingRestore.vaultPath ?? "(scratch)",
  });

  const ref = tab.pendingRestore;
  const paneId = tab.paneId;
  const panes = state.panes;
  const core = getCore();

  if (ref.vaultPath) {
    const doc = await core.document.open(ref.vaultPath, {
      paneId,
      initialMode: ref.viewState?.mode,
      restoreSession: true,
    });
    if (ref.viewState) {
      core.document.updateViewState(doc.id, ref.viewState);
    }
    const hydrated = documentToEditorTab(core.document.get(doc.id)!, paneId, panes);
    useEditorStore.setState({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...hydrated, id: tabId, pendingRestore: undefined }
          : t,
      ),
    });
    pushContentToSurface(core.document.get(doc.id)!);
    return;
  }

  const scratchData = await loadScratchRestoreData(ref);
  const doc = createEphemeralFromScratchRestore(core.document, paneId, scratchData);
  const hydrated = documentToEditorTab(core.document.get(doc.id)!, paneId, panes);
  useEditorStore.setState({
    tabs: state.tabs.map((t) =>
      t.id === tabId ? { ...hydrated, id: tabId, pendingRestore: undefined } : t,
    ),
  });
  }, { tabId });
}

/** Ensure a tab exists in pane for document and focus it. */
export function ensureDocumentTabInPane(doc: DocumentRecord, paneId: string): void {
  const state = useEditorStore.getState();
  const existing = state.tabs.find(
    (t) => t.documentId === doc.id && t.paneId === paneId,
  );

  if (existing) {
    syncDocumentToEditorTabs(doc);
    pushContentToSurface(doc);
    useEditorStore.setState({
      activeTabIdByPane: { ...state.activeTabIdByPane, [paneId]: existing.id },
      activePaneId: paneId,
    });
    return;
  }

  const tab = documentToEditorTab(doc, paneId, state.panes);
  useEditorStore.setState({
    tabs: [...state.tabs, tab],
    activeTabIdByPane: { ...state.activeTabIdByPane, [paneId]: tab.id },
    activePaneId: paneId,
  });
  pushContentToSurface(doc);
}

export function removeDocumentFromEditor(documentId: string): void {
  const state = useEditorStore.getState();
  const workspaceTab = state.tabs.find(
    (t) => t.documentId === documentId && t.kind === "workspace" && t.path,
  );
  if (workspaceTab?.path) {
    void import("@/core/local-history/service").then(({ stopAutoSnapshot }) => {
      stopAutoSnapshot(workspaceTab.path);
    });
  }

  const tabs = state.tabs.filter((t) => t.documentId !== documentId);
  useEditorStore.setState({
    tabs,
    activeTabIdByPane: remapActiveTabsAfterClose(tabs, state.activeTabIdByPane),
  });
}

/** Persist surface mode into DocumentService.viewState (ADR-005/006). */
export function syncSurfaceModeToDocument(tabId: string, mode: EditorTab["surfaceMode"]): void {
  const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const doc = getCore().document.get(tab.documentId);
  if (!doc) return;
  getCore().document.updateViewState(tab.documentId, { mode: normalizeSurfaceMode(mode) });
}
