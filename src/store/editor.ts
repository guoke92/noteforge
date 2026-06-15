import { create } from "zustand";
import { scratch, fs } from "@/ipc";
import { basename, detectLanguageFromName } from "@/lib/utils";
import { detectLanguageFromContent, isMarkdownTab } from "@/lib/editor-doc";
import {
  isScratchTab,
  nextUntitledDisplayName,
  normalizeScratchDisplayNames,
} from "@/lib/editor-doc";
import {
  openConfirmCloseDialog,
  openSaveAsDialog,
  openClosePaneDialog,
  closeDialog,
} from "@/core/dialog/dialog-api";
import { useWorkspaceStore } from "@/store/workspace";
import { promptSaveScratchTab } from "@/lib/save-dialog";
import { getCore, openDocumentInPane, createUntitledInPane, saveDocument, flushCoreBeforeExit, scheduleWorkspacePersist } from "@/core/runtime";
import { syncDocumentToEditorTabs } from "@/core/bridge/editor-sync";
import {
  scheduleScratchAutosave,
  ensureScratchFlushed,
  flushAllDirtyScratchBuffers,
  cancelPendingScratchAutosave,
} from "@/core/session/scratch-autosave";
import { captureAllOpenTabViewStates, deactivateTab } from "@/core/session/tab-lifecycle";
import { wireEditorStoreHost } from "@/core/bridge/editor-store-bridge";
import type { EditorSurfaceMode } from "@/core/document/types";
import { normalizeSurfaceMode } from "@/core/workbench/types";
import { resolveSurfaceMode } from "@/lib/surface-mode";
import type { EditorCaretStatus } from "@/lib/editor-caret-status";

export type EditorTabKind = "scratch" | "workspace";
/** Aligned with DocumentService.viewState.mode */
export type SurfaceMode = EditorSurfaceMode;

export interface EditorTab {
  id: string;
  kind: EditorTabKind;
  /** Stable id for scratch persistence */
  scratchId?: string;
  /** Real filesystem path when kind === workspace */
  path: string;
  /** Tab title (Untitled-1 or file name) */
  displayName: string;
  language: string;
  content: string;
  /** Last persisted snapshot (disk or scratch buffer) */
  baseline: string;
  paneId: string;
  surfaceMode?: SurfaceMode;
  /** JSON/YAML tree panel follows editor cursor (default true). */
  treeSyncLinked?: boolean;
  /** Tab was cloned or newly opened in a secondary pane (not moved from main). */
  openedInSplit?: boolean;
  /** Original index among main-pane tabs when moved from main to a split. */
  mainPaneOrder?: number;
}

export const MAIN_PANE_ID = "pane-1";

export function isMainPane(paneId: string, panes: string[]): boolean {
  return panes.length > 0 && panes[0] === paneId;
}

interface EditorState {
  panes: string[];
  tabs: EditorTab[];
  activeTabIdByPane: Record<string, string | undefined>;
  activePaneId: string;
  sessionRestored: boolean;
  revealLineRequest: { tabId: string; line: number } | null;
  caretStatusByTab: Record<string, EditorCaretStatus>;

  openFile: (path: string, paneId?: string) => Promise<void>;
  closeTab: (id: string) => void;
  requestCloseTab: (id: string) => void;
  requestCloseTabs: (ids: string[]) => void;
  cancelCloseTabQueue: () => void;
  continueCloseTabQueue: () => void;
  discardAndCloseTab: (id: string) => Promise<void>;
  flushBeforeExit: () => Promise<void>;
  /** VS Code-style quit: prompt for dirty workspace files; always snapshot window session. */
  requestAppExit: () => Promise<boolean>;
  isAppExitInProgress: () => boolean;
  revertTabChanges: (id: string) => Promise<void>;
  advanceAppExitQueue: () => void;
  setActive: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  saveTab: (id?: string) => Promise<void>;
  saveTabAs: (id: string, targetPath: string) => Promise<void>;
  setLanguage: (id: string, language: string) => void;
  cycleSurfaceMode: (id: string) => void;
  setSurfaceMode: (id: string, mode: SurfaceMode) => void;
  /** Internal — used by EditorHost after flush. */
  applySurfaceMode: (id: string, mode: SurfaceMode) => void;
  toggleTreeSyncLinked: (id: string) => void;
  splitRight: () => string;
  requestClosePane: (paneId: string) => void;
  closePaneWithDisposition: (
    paneId: string,
    mode: "merge-to-main" | "close-tabs",
  ) => Promise<void>;
  openTabInMainPane: (tabId: string) => void;
  openTabInPane: (tabId: string, paneId: string) => void;
  openTabInNewPane: (tabId: string) => string;
  moveTabToPane: (tabId: string, paneId: string) => void;
  newUntitled: (paneId?: string) => void;
  setActivePane: (paneId: string) => void;
  ensureFreshFromDisk: (path: string) => Promise<void>;
  restoreScratchSession: () => Promise<void>;
  persistEditorSession: () => Promise<void>;
  requestRevealLine: (tabId: string, line: number) => void;
  consumeRevealLine: () => void;
  reportCaretStatus: (tabId: string, status: EditorCaretStatus) => void;
}

function tabId(): string {
  return "tab-" + Math.random().toString(36).slice(2, 11);
}

function scratchId(): string {
  return "scratch-" + Math.random().toString(36).slice(2, 11);
}

let saveTabInFlight = false;

let closeTabQueue: string[] = [];
let closeTabQueueProcessing = false;
let closeTabQueueReason: "tab" | "app-exit" | null = null;
let pendingClosePaneId: string | null = null;
let pendingAppExitResolver: ((allowed: boolean) => void) | null = null;

export function isAppExitCloseQueue(): boolean {
  return closeTabQueueReason === "app-exit";
}

async function processCloseTabQueue() {
  if (closeTabQueueProcessing) return;
  closeTabQueueProcessing = true;

  try {
    while (closeTabQueue.length > 0) {
      const id = closeTabQueue[0]!;
      const tab = useEditorStore.getState().tabs.find((t) => t.id === id);
      if (!tab) {
        closeTabQueue.shift();
        continue;
      }
      if (isDirty(tab)) {
        if (tab.kind === "workspace" && tab.path) {
          const { ensureWorkspaceDraftFlushed } = await import(
            "@/core/session/workspace-draft-autosave"
          );
          await ensureWorkspaceDraftFlushed(tab.path);
          closeTabQueue.shift();
          await useEditorStore.getState().discardAndCloseTab(id);
          continue;
        }
        openConfirmCloseDialog(id);
        return;
      }
      closeTabQueue.shift();
      await useEditorStore.getState().discardAndCloseTab(id);
    }

    if (closeTabQueue.length === 0 && pendingAppExitResolver) {
      await flushAllDirtyScratchBuffers();
      captureAllOpenTabViewStates();
      await useEditorStore.getState().persistEditorSession();
      const resolve = pendingAppExitResolver;
      pendingAppExitResolver = null;
      closeTabQueueReason = null;
      resolve(true);
    }

    if (pendingClosePaneId) {
      const paneId = pendingClosePaneId;
      pendingClosePaneId = null;
      if (useEditorStore.getState().panes.includes(paneId)) {
        finalizeClosePane(
          paneId,
          useEditorStore.getState().tabs,
          useEditorStore.getState,
          useEditorStore.setState,
        );
      }
    }
  } finally {
    closeTabQueueProcessing = false;
  }
}

function scheduleSessionPersist() {
  scheduleWorkspacePersist();
}

function isSameDocument(a: EditorTab, b: EditorTab): boolean {
  if (a.id === b.id) return true;
  if (a.kind === "scratch" && b.kind === "scratch" && a.scratchId && b.scratchId) {
    return a.scratchId === b.scratchId;
  }
  if (a.kind === "workspace" && b.kind === "workspace" && a.path && b.path) {
    return a.path === b.path;
  }
  return false;
}

function duplicateTab(source: EditorTab, targetPaneId: string, panes: string[]): EditorTab {
  const toMain = isMainPane(targetPaneId, panes);
  return {
    ...source,
    id: tabId(),
    paneId: targetPaneId,
    openedInSplit: !toMain,
    mainPaneOrder: undefined,
  };
}

function findMainTabInsertIndex(
  tabs: EditorTab[],
  tab: EditorTab,
  mainPaneId: string,
): number {
  const mainIndices: number[] = [];
  for (let i = 0; i < tabs.length; i++) {
    if (tabs[i]!.paneId === mainPaneId) mainIndices.push(i);
  }

  if (tab.mainPaneOrder !== undefined && !tab.openedInSplit) {
    const idx = tab.mainPaneOrder;
    if (idx >= 0 && idx < mainIndices.length) return mainIndices[idx]!;
    if (mainIndices.length > 0) return mainIndices[mainIndices.length - 1]! + 1;
    return tabs.length;
  }

  if (mainIndices.length > 0) return mainIndices[mainIndices.length - 1]! + 1;
  return tabs.length;
}

function mergePaneTabsToMain(tabs: EditorTab[], paneId: string, mainPaneId: string): EditorTab[] {
  let result = [...tabs];
  const closingTabs = result.filter((t) => t.paneId === paneId);

  for (const tab of closingTabs) {
    const mainTabs = result.filter((t) => t.paneId === mainPaneId);
    const dupInMain = mainTabs.find((t) => isSameDocument(t, tab) && t.id !== tab.id);

    if (dupInMain) {
      result = result.filter((t) => t.id !== tab.id);
      continue;
    }

    const updated: EditorTab = {
      ...tab,
      paneId: mainPaneId,
      openedInSplit: undefined,
      mainPaneOrder: undefined,
    };
    result = result.filter((t) => t.id !== tab.id);
    const insertAt = findMainTabInsertIndex(result, tab, mainPaneId);
    result.splice(insertAt, 0, updated);
  }
  return result;
}

function finalizeClosePane(
  paneId: string,
  tabs: EditorTab[],
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
) {
  const state = get();
  const panes = state.panes.filter((p) => p !== paneId);
  const map = { ...state.activeTabIdByPane };
  delete map[paneId];
  const mainPaneId = panes[0]!;
  const activePaneId = state.activePaneId === paneId ? mainPaneId : state.activePaneId;
  if (!map[mainPaneId]) {
    const mainTabs = tabs.filter((t) => t.paneId === mainPaneId);
    if (mainTabs.length) map[mainPaneId] = mainTabs[mainTabs.length - 1]!.id;
  }
  set({
    panes,
    tabs,
    activeTabIdByPane: map,
    activePaneId,
  });
  scheduleSessionPersist();
}

export const useEditorStore = create<EditorState>((set, get) => ({
  panes: ["pane-1"],
  tabs: [],
  activeTabIdByPane: {},
  activePaneId: "pane-1",
  sessionRestored: false,
  revealLineRequest: null,
  caretStatusByTab: {},

  reportCaretStatus(tabId, status) {
    const prev = get().caretStatusByTab[tabId];
    if (
      prev &&
      prev.line === status.line &&
      prev.column === status.column &&
      prev.selectionChars === status.selectionChars &&
      prev.selectionLines === status.selectionLines
    ) {
      return;
    }
    set({
      caretStatusByTab: { ...get().caretStatusByTab, [tabId]: status },
    });
  },

  async openFile(path: string, paneId?: string) {
    const targetPane = paneId || get().activePaneId;
    try {
      await openDocumentInPane(path, targetPane);
    } catch (e) {
      console.error("openFile failed", e);
      window.alert(`无法打开文件：${path}`);
    }
  },

  requestCloseTab(id: string) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.kind === "workspace" && isDirty(tab) && tab.path) {
      void (async () => {
        const { ensureWorkspaceDraftFlushed } = await import(
          "@/core/session/workspace-draft-autosave"
        );
        await ensureWorkspaceDraftFlushed(tab.path!);
        await get().discardAndCloseTab(id);
      })();
      return;
    }
    if (isDirty(tab)) {
      openConfirmCloseDialog(id);
      return;
    }
    void get().discardAndCloseTab(id);
  },

  closeTab(id: string) {
    get().requestCloseTab(id);
  },

  requestCloseTabs(ids: string[]) {
    const unique = ids.filter((id, i, arr) => arr.indexOf(id) === i);
    closeTabQueue = unique.filter((id) => get().tabs.some((t) => t.id === id));
    void processCloseTabQueue();
  },

  cancelCloseTabQueue() {
    closeTabQueue = [];
    pendingClosePaneId = null;
    closeTabQueueProcessing = false;
    if (pendingAppExitResolver) {
      pendingAppExitResolver(false);
      pendingAppExitResolver = null;
    }
    closeTabQueueReason = null;
    closeDialog();
  },

  continueCloseTabQueue() {
    void processCloseTabQueue();
  },

  async discardAndCloseTab(id: string) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) {
      closeDialog();
      void processCloseTabQueue();
      return;
    }

    if (getCore().document.get(id)) {
      await getCore().document.close(id, { force: true });
      closeDialog();
      void get().persistEditorSession();
      if (closeTabQueue[0] === id) {
        closeTabQueue.shift();
      }
      void processCloseTabQueue();
      return;
    }

    if (tab.kind === "scratch" && tab.scratchId) {
      await ensureScratchFlushed(tab.scratchId);
      const stillOpen = get().tabs.some(
        (t) => t.id !== id && t.scratchId === tab.scratchId,
      );
      if (!stillOpen) {
        try {
          await scratch.deleteBuffer(tab.scratchId);
        } catch {
          /* ignore */
        }
      }
    }

    const tabs = get().tabs.filter((t) => t.id !== id);
    const map = { ...get().activeTabIdByPane };
    for (const pane of get().panes) {
      if (map[pane] === id) {
        const remaining = tabs.filter((t) => t.paneId === pane);
        map[pane] = remaining.length ? remaining[remaining.length - 1]!.id : undefined;
      }
    }
    set({ tabs, activeTabIdByPane: map });
    closeDialog();
    void get().persistEditorSession();
    if (closeTabQueue[0] === id) {
      closeTabQueue.shift();
    }
    void processCloseTabQueue();
  },

  async flushBeforeExit() {
    if (!get().sessionRestored) return;
    cancelPendingScratchAutosave();
    const { cancelPendingWorkspaceDraftAutosave } = await import(
      "@/core/session/workspace-draft-autosave"
    );
    cancelPendingWorkspaceDraftAutosave();
    captureAllOpenTabViewStates();
    await flushCoreBeforeExit();
    await flushAllDirtyScratchBuffers();
    await get().persistEditorSession();
  },

  isAppExitInProgress() {
    return closeTabQueueReason === "app-exit";
  },

  async requestAppExit() {
    captureAllOpenTabViewStates();
    cancelPendingScratchAutosave();
    const { cancelPendingWorkspaceDraftAutosave } = await import(
      "@/core/session/workspace-draft-autosave"
    );
    cancelPendingWorkspaceDraftAutosave();
    await flushCoreBeforeExit();
    await flushAllDirtyScratchBuffers();
    await get().persistEditorSession();
    return true;
  },

  async revertTabChanges(id: string) {
    const doc = getCore().document.get(id);
    if (doc) {
      await getCore().document.revert(id);
      const next = getCore().document.get(id);
      if (next) syncDocumentToEditorTabs(next);
      return;
    }
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    set({
      tabs: get().tabs.map((t) =>
        t.id === id ? { ...t, content: t.baseline } : t,
      ),
    });
  },

  advanceAppExitQueue() {
    if (closeTabQueueReason !== "app-exit") return;
    if (closeTabQueue[0]) closeTabQueue.shift();
    void processCloseTabQueue();
  },

  setActive(id: string) {
    const state = get();
    const prevActiveId = state.activeTabIdByPane[state.activePaneId];
    if (prevActiveId && prevActiveId !== id) {
      deactivateTab(prevActiveId);
    }

    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) return;
    set({
      activeTabIdByPane: { ...state.activeTabIdByPane, [tab.paneId]: id },
      activePaneId: tab.paneId,
    });
    scheduleSessionPersist();
  },

  setActivePane(paneId: string) {
    const state = get();
    const prevActiveId = state.activeTabIdByPane[state.activePaneId];
    if (prevActiveId && paneId !== state.activePaneId) {
      deactivateTab(prevActiveId);
    }
    set({ activePaneId: paneId });
    scheduleSessionPersist();
  },

  updateContent(id: string, content: string) {
    const coreDoc = getCore().document.get(id);
    if (coreDoc) {
      getCore().document.applyPatch(id, { kind: "replace-all", content });
      return;
    }

    const source = get().tabs.find((t) => t.id === id);
    if (!source) return;

    set({
      tabs: get().tabs.map((t) => {
        if (!isSameDocument(source, t)) return t;
        const language =
          t.kind === "scratch"
            ? detectLanguageFromContent(content) ?? "plaintext"
            : t.language;
        const next = { ...t, content, language };
        if (!isMarkdownTab(next)) {
          return { ...next, surfaceMode: "source" as const };
        }
        return next;
      }),
    });
    if (source.kind === "scratch" && source.scratchId) {
      const updated = get().tabs.find((t) => t.scratchId === source.scratchId);
      if (updated && isDirty(updated)) {
        scheduleScratchAutosave(source.scratchId);
      }
    }
    scheduleSessionPersist();
  },

  async saveTab(id?: string) {
    if (saveTabInFlight) return;
    saveTabInFlight = true;
    try {
      const targetId = id || get().activeTabIdByPane[get().activePaneId];
      if (!targetId) return;

      if (getCore().document.get(targetId)) {
        await saveDocument(targetId);
        return;
      }

      const tab = get().tabs.find((t) => t.id === targetId);
      if (!tab) return;

      if (tab.kind === "scratch") {
        const wsPath = useWorkspaceStore.getState().current?.path;
        await promptSaveScratchTab(
          tab.id,
          wsPath,
          (tid, path) => get().saveTabAs(tid, path),
          (tid) => openSaveAsDialog(tid),
        );
        return;
      }

      await fs.write(tab.path, tab.content);
      set({
        tabs: get().tabs.map((t) =>
          isSameDocument(tab, t) ? { ...t, baseline: tab.content } : t,
        ),
      });
    } finally {
      saveTabInFlight = false;
    }
  },

  async saveTabAs(id: string, targetPath: string) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;

    try {
      await fs.create(targetPath, tab.content);
    } catch {
      await fs.write(targetPath, tab.content);
    }

    if (tab.kind === "scratch" && tab.scratchId) {
      await ensureScratchFlushed(tab.scratchId);
      await scratch.deleteBuffer(tab.scratchId);
    }

    const name = basename(targetPath);
    const lang =
      detectLanguageFromContent(tab.content) || detectLanguageFromName(name) || tab.language;
    const isMd = isMarkdownTab({
      kind: "workspace",
      path: targetPath,
      content: tab.content,
    });

    set({
      tabs: get().tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              kind: "workspace" as const,
              scratchId: undefined,
              path: targetPath,
              displayName: name,
              language: lang,
              baseline: tab.content,
              surfaceMode: isMd ? t.surfaceMode || "write" : "source",
            }
          : t,
      ),
    });

    void useWorkspaceStore.getState().refreshTree();
    void get().persistEditorSession();
  },

  setLanguage(id, language) {
    set({
      tabs: get().tabs.map((t) => (t.id === id ? { ...t, language } : t)),
    });
    const tab = get().tabs.find((t) => t.id === id);
    if (tab?.kind === "scratch" && tab.scratchId && isDirty(tab)) {
      scheduleScratchAutosave(tab.scratchId);
    }
  },

  cycleSurfaceMode(id) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    const order: SurfaceMode[] = ["write", "read", "source"];
    const curr = resolveSurfaceMode(tab);
    const nextMode = order[(order.indexOf(curr) + 1) % order.length]!;
    void getCore().editorHost.setMode(id, nextMode);
  },

  setSurfaceMode(id, mode) {
    void getCore().editorHost.setMode(id, normalizeSurfaceMode(mode));
  },

  applySurfaceMode(id, mode) {
    const normalized = normalizeSurfaceMode(mode);
    set({
      tabs: get().tabs.map((t) =>
        t.id === id ? { ...t, surfaceMode: normalized } : t,
      ),
    });
  },

  toggleTreeSyncLinked(id) {
    set({
      tabs: get().tabs.map((t) =>
        t.id === id ? { ...t, treeSyncLinked: t.treeSyncLinked === false } : t,
      ),
    });
  },

  splitRight() {
    const id = `pane-${get().panes.length + 1}`;
    set({
      panes: [...get().panes, id],
      activePaneId: id,
    });
    scheduleSessionPersist();
    return id;
  },

  requestClosePane(paneId) {
    const panes = get().panes;
    if (isMainPane(paneId, panes) || panes.length <= 1) return;

    const paneTabs = get().tabs.filter((t) => t.paneId === paneId);
    if (paneTabs.length === 0) {
      finalizeClosePane(paneId, get().tabs, get, set);
      return;
    }
    openClosePaneDialog(paneId);
  },

  async closePaneWithDisposition(paneId, mode) {
    const panes = get().panes;
    if (isMainPane(paneId, panes) || panes.length <= 1) return;

    if (mode === "close-tabs") {
      pendingClosePaneId = paneId;
      const paneTabIds = get()
        .tabs.filter((t) => t.paneId === paneId)
        .map((t) => t.id);
      get().requestCloseTabs(paneTabIds);
      return;
    }

    const mainPaneId = panes[0]!;
    const tabs = mergePaneTabsToMain(get().tabs, paneId, mainPaneId);
    finalizeClosePane(paneId, tabs, get, set);
  },

  openTabInMainPane(tabId) {
    const panes = get().panes;
    const mainPaneId = panes[0]!;
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.paneId === mainPaneId) {
      get().setActive(tabId);
      return;
    }

    const dupInMain = get().tabs.find(
      (t) => t.paneId === mainPaneId && isSameDocument(t, tab) && t.id !== tab.id,
    );
    if (dupInMain) {
      void get().discardAndCloseTab(tabId);
      get().setActive(dupInMain.id);
      return;
    }

    let tabs = get().tabs.filter((t) => t.id !== tabId);
    const updated: EditorTab = {
      ...tab,
      paneId: mainPaneId,
      openedInSplit: undefined,
      mainPaneOrder: undefined,
    };
    const insertAt = findMainTabInsertIndex(tabs, tab, mainPaneId);
    tabs.splice(insertAt, 0, updated);

    const map = { ...get().activeTabIdByPane };
    if (map[tab.paneId] === tabId) {
      const remaining = tabs.filter((t) => t.paneId === tab.paneId);
      map[tab.paneId] = remaining.length ? remaining[remaining.length - 1]!.id : undefined;
    }
    map[mainPaneId] = tabId;

    set({ tabs, activeTabIdByPane: map, activePaneId: mainPaneId });
    scheduleSessionPersist();
  },

  openTabInPane(tabId, paneId) {
    const source = get().tabs.find((t) => t.id === tabId);
    if (!source) return;

    const existing = get().tabs.find(
      (t) =>
        t.paneId === paneId &&
        ((source.kind === "scratch" &&
          t.kind === "scratch" &&
          t.scratchId === source.scratchId) ||
          (source.kind === "workspace" &&
            t.kind === "workspace" &&
            t.path === source.path)),
    );

    const map = { ...get().activeTabIdByPane };
    if (existing) {
      map[paneId] = existing.id;
      set({ activeTabIdByPane: map, activePaneId: paneId });
      scheduleSessionPersist();
      return;
    }

    const cloned = duplicateTab(source, paneId, get().panes);
    map[paneId] = cloned.id;
    set({
      tabs: [...get().tabs, cloned],
      activeTabIdByPane: map,
      activePaneId: paneId,
    });
    scheduleSessionPersist();
  },

  openTabInNewPane(tabId) {
    const paneId = get().splitRight();
    get().openTabInPane(tabId, paneId);
    return paneId;
  },

  moveTabToPane(tabId, paneId) {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.paneId === paneId) return;

    const existing = get().tabs.find(
      (t) =>
        t.paneId === paneId &&
        t.id !== tabId &&
        ((tab.kind === "scratch" &&
          t.kind === "scratch" &&
          t.scratchId === tab.scratchId) ||
          (tab.kind === "workspace" &&
            t.kind === "workspace" &&
            t.path === tab.path)),
    );
    if (existing) {
      void get().discardAndCloseTab(tabId);
      get().setActive(existing.id);
      return;
    }

    const panes = get().panes;
    const mainPaneId = panes[0]!;
    let patch: Partial<EditorTab> = { paneId };
    if (tab.paneId === mainPaneId && paneId !== mainPaneId) {
      const mainTabs = get().tabs.filter((t) => t.paneId === mainPaneId);
      patch = {
        ...patch,
        mainPaneOrder: mainTabs.findIndex((t) => t.id === tabId),
        openedInSplit: false,
      };
    } else if (paneId === mainPaneId) {
      patch = { ...patch, openedInSplit: undefined, mainPaneOrder: undefined };
    }

    const map = { ...get().activeTabIdByPane };
    if (map[tab.paneId] === tabId) {
      const remaining = get().tabs.filter(
        (t) => t.paneId === tab.paneId && t.id !== tabId,
      );
      map[tab.paneId] = remaining.length ? remaining[remaining.length - 1]!.id : undefined;
    }
    map[paneId] = tabId;

    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
      activeTabIdByPane: map,
      activePaneId: paneId,
    });
    scheduleSessionPersist();
  },

  newUntitled(paneId?: string) {
    const pane = paneId ?? get().activePaneId;
    createUntitledInPane(pane);
    scheduleSessionPersist();
  },

  async ensureFreshFromDisk(path) {
    const coreDoc = getCore().document.list().find((d) => d.vaultPath === path);
    if (coreDoc) {
      await getCore().document.notifyExternalChange(path);
      const refreshed = getCore().document.get(coreDoc.id);
      if (refreshed) syncDocumentToEditorTabs(refreshed);
      return;
    }

    const openTabs = get().tabs.filter((t) => t.path === path && t.kind === "workspace");
    if (openTabs.length === 0) return;
    if (openTabs.some((t) => t.content !== t.baseline)) return;
    try {
      const { content } = await fs.read(path);
      const stale = openTabs.some((t) => t.content !== content);
      if (!stale) return;
      set({
        tabs: get().tabs.map((t) =>
          t.path === path && t.kind === "workspace"
            ? { ...t, content, baseline: content }
            : t,
        ),
      });
    } catch (e) {
      console.error("ensureFreshFromDisk failed", path, e);
    }
  },

  async restoreScratchSession() {
    if (get().sessionRestored) return;
    await getCore().workbench.restoreSession();
  },

  async persistEditorSession() {
    await getCore().workbench.persistSession();
  },

  requestRevealLine(tabId, line) {
    set({ revealLineRequest: { tabId, line } });
  },

  consumeRevealLine() {
    set({ revealLineRequest: null });
  },
}));

wireEditorStoreHost(() => useEditorStore.getState());

export function isDirty(tab: EditorTab): boolean {
  return tab.content !== tab.baseline;
}

/** Scratch tab not yet saved into workspace */
export function isScratchOnly(tab: EditorTab): boolean {
  return isScratchTab(tab);
}
