import {
  isMainPane,
  useEditorStore,
  type EditorTab,
  type SurfaceMode,
} from "@/store/editor";
import { isMarkdownTab, nextUntitledDisplayName } from "@/lib/editor-doc";
import { basename } from "@/lib/utils";
import type { DocumentRecord } from "../document/types";
import type { EditorSurfaceMode } from "../document/types";
import { getCore } from "../runtime";

function surfaceFromDocument(mode: EditorSurfaceMode): SurfaceMode {
  return mode;
}

export function documentToEditorTab(
  doc: DocumentRecord,
  paneId: string,
  panes: string[],
): EditorTab {
  const isMd = isMarkdownTab({
    kind: doc.vaultPath ? "workspace" : "scratch",
    path: doc.vaultPath ?? "",
    content: doc.content,
  });
  const surfaceMode = surfaceFromDocument(doc.viewState.mode);

  if (doc.vaultPath) {
    return {
      id: doc.id,
      kind: "workspace",
      path: doc.vaultPath,
      displayName: doc.title || basename(doc.vaultPath),
      language: doc.language,
      content: doc.content,
      baseline: doc.baseline,
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
    id: doc.id,
    kind: "scratch",
    scratchId: doc.id,
    path: "",
    displayName,
    language: doc.language,
    content: doc.content,
    baseline: doc.baseline,
    paneId,
    surfaceMode: isMd ? surfaceMode : "source",
    openedInSplit: !isMainPane(paneId, panes),
  };
}

/** Push canonical document content into all editor tabs bound to this document id. */
export function syncDocumentToEditorTabs(doc: DocumentRecord): void {
  const state = useEditorStore.getState();
  const hasTab = state.tabs.some((t) => t.id === doc.id);
  if (!hasTab) return;

  useEditorStore.setState({
    tabs: state.tabs.map((t) => {
      if (t.id !== doc.id) return t;
      const surfaceMode = surfaceFromDocument(doc.viewState.mode);
      const isMd = isMarkdownTab({
        kind: doc.vaultPath ? "workspace" : "scratch",
        path: doc.vaultPath ?? t.path,
        content: doc.content,
      });
      if (doc.vaultPath) {
        return {
          ...t,
          kind: "workspace" as const,
          path: doc.vaultPath,
          scratchId: undefined,
          displayName: doc.title || basename(doc.vaultPath),
          language: doc.language,
          content: doc.content,
          baseline: doc.baseline,
          surfaceMode: isMd ? surfaceMode : "source",
        };
      }
      return {
        ...t,
        language: doc.language,
        content: doc.content,
        baseline: doc.baseline,
      };
    }),
  });

  getCore().editorHost.applyExternalContent(doc.id, doc.content);
}

/** Ensure a tab exists in pane for document and focus it. */
export function ensureDocumentTabInPane(doc: DocumentRecord, paneId: string): void {
  const state = useEditorStore.getState();
  const existing = state.tabs.find((t) => t.id === doc.id && t.paneId === paneId);

  if (existing) {
    syncDocumentToEditorTabs(doc);
    useEditorStore.setState({
      activeTabIdByPane: { ...state.activeTabIdByPane, [paneId]: doc.id },
      activePaneId: paneId,
    });
    return;
  }

  const tab = documentToEditorTab(doc, paneId, state.panes);
  useEditorStore.setState({
    tabs: [...state.tabs, tab],
    activeTabIdByPane: { ...state.activeTabIdByPane, [paneId]: doc.id },
    activePaneId: paneId,
  });
}

export function removeDocumentFromEditor(documentId: string): void {
  const state = useEditorStore.getState();
  const tabs = state.tabs.filter((t) => t.id !== documentId);
  const map = { ...state.activeTabIdByPane };
  for (const pane of state.panes) {
    if (map[pane] === documentId) {
      const remaining = tabs.filter((t) => t.paneId === pane);
      map[pane] = remaining.length ? remaining[remaining.length - 1]!.id : undefined;
    }
  }
  useEditorStore.setState({ tabs, activeTabIdByPane: map });
}

/** Persist surface mode into DocumentService.viewState (ADR-005/006). */
export function syncSurfaceModeToDocument(tabId: string, mode: SurfaceMode): void {
  const doc = getCore().document.get(tabId);
  if (!doc) return;
  getCore().document.updateViewState(tabId, { mode });
}

