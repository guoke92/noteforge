import { useEditorStore } from "@/store/editor";
import { useWorkspaceStore } from "@/store/workspace";
import { useUIStore, type RightPanelMode } from "@/store/ui";
import type { DocumentService } from "../document/service";
import type { VaultService } from "../vault/service";
import type { EventBus } from "../events";
import {
  ensureDocumentTabInPane,
  mountDeferredTabShell,
  syncDocumentToEditorTabs,
} from "../bridge/editor-sync";
import type { WorkbenchService, SessionPersistReason } from "./service";
import type { LayoutState,
  PersistedPane,
  PersistedTabRef,
  WorkspaceSession,
} from "./types";
import { captureAllOpenTabViewStates } from "../session/tab-lifecycle";
import { normalizeSurfaceMode } from "./types";
import {
  clearLegacyScratchSession,
  loadLegacyScratchSession,
  loadWorkspaceSession,
  saveWorkspaceSession,
} from "./session-storage";
import { DEFAULT_PREFERENCES } from "../platform/config";
import {
  SESSION_PERSIST_CONTENT_DEBOUNCE_MS,
  SESSION_PERSIST_LAYOUT_DEBOUNCE_MS,
} from "../platform/timing";
import { MAIN_PANE_ID } from "../bridge/tab-pane-utils";
import {
  createEphemeralFromScratchRestore,
  loadScratchRestoreData,
} from "../session/scratch-restore";
import { perfAsync, perfLog, perfStart } from "@/lib/startup-perf";

export interface WorkbenchServiceDeps {
  eventBus: EventBus;
  vault: VaultService;
  document: DocumentService;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let scheduledPersistReason: SessionPersistReason = "layout";
let restoreInflight: Promise<boolean> | null = null;
let lastPersistedVault: { id: string; rootPath: string } | null = null;
/** Stable session fields for change detection (excludes savedAt). */
let lastPersistedSessionFingerprint: string | null = null;
/** While true, never write session — avoids wiping localStorage mid-restore. */
let sessionPersistSuspended = false;

function normalizeVaultPath(path: string): string {
  return path.replace(/\/+$/, "");
}

function sessionFingerprint(session: WorkspaceSession | null): string | null {
  if (!session) return null;
  const { savedAt: _savedAt, ...stable } = session;
  return JSON.stringify(stable);
}

function seedPersistedSessionSnapshot(session: WorkspaceSession | null): void {
  lastPersistedSessionFingerprint = sessionFingerprint(session);
}

function resolveVaultForSession(vault: VaultService): { id: string; rootPath: string } | null {
  const current = vault.getCurrent();
  if (current) {
    return { id: current.id, rootPath: normalizeVaultPath(current.rootPath) };
  }

  const ws = useWorkspaceStore.getState().current;
  if (ws) {
    return { id: ws.id, rootPath: normalizeVaultPath(ws.path) };
  }

  if (lastPersistedVault) return lastPersistedVault;

  const editor = useEditorStore.getState();
  const fileTab = editor.tabs.find((t) => t.kind === "workspace" && t.path);
  if (fileTab) {
    const parent = fileTab.path.slice(0, fileTab.path.lastIndexOf("/"));
    if (parent) {
      return { id: "inferred", rootPath: normalizeVaultPath(parent) };
    }
  }

  return null;
}

function uiModeToLayout(mode: RightPanelMode): LayoutState["rightPanelMode"] {
  if (mode === "tree") return "graph";
  return mode;
}

function layoutModeToUi(mode: LayoutState["rightPanelMode"]): RightPanelMode {
  if (mode === "graph") return "tree";
  return mode;
}

function readLayoutFromUi(): LayoutState {
  const ui = useUIStore.getState();
  return {
    sidebarOpen: ui.sidebarOpen,
    sidebarWidth: ui.sidebarWidth,
    rightPanelOpen: ui.rightOpen,
    rightPanelWidth: ui.rightWidth,
    rightPanelMode: uiModeToLayout(ui.rightMode),
  };
}

function applyLayout(layout: LayoutState): void {
  useUIStore.setState({
    sidebarOpen: layout.sidebarOpen,
    sidebarWidth: layout.sidebarWidth,
    rightOpen: layout.rightPanelOpen,
    rightWidth: layout.rightPanelWidth,
    rightMode: layoutModeToUi(layout.rightPanelMode),
  });
}

function buildPersistedTab(tabId: string, order: number): PersistedTabRef | null {
  const editor = useEditorStore.getState();
  const tab = editor.tabs.find((t) => t.id === tabId);
  if (!tab) return null;

  const doc = getDocumentFromRuntime(tabId);
  const vaultPath =
    doc?.vaultPath ?? (tab.pendingRestore?.vaultPath ?? (tab.path ? tab.path : null));
  if (vaultPath && tab.kind !== "scratch") {
    return {
      vaultPath,
      order,
      viewState:
        doc?.viewState ??
        tab.pendingRestore?.viewState ?? {
          mode: tab.surfaceMode ?? DEFAULT_PREFERENCES.editor.defaultSurfaceMode,
        },
    };
  }

  if (tab.kind === "scratch" && (tab.scratchId || tab.pendingRestore?.scratchId)) {
    return {
      vaultPath: null,
      scratchId: tab.scratchId ?? tab.pendingRestore?.scratchId,
      order,
      viewState:
        doc?.viewState ??
        tab.pendingRestore?.viewState ?? {
          mode: tab.surfaceMode ?? DEFAULT_PREFERENCES.editor.defaultSurfaceMode,
        },
    };
  }

  return null;
}

/** Avoid circular import — document passed via closure in factory. */
let documentRef: DocumentService;

function getDocumentFromRuntime(tabId: string) {
  const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab || tab.pendingRestore) return null;
  return documentRef.get(tab.documentId);
}

export function createWorkbenchService(deps: WorkbenchServiceDeps): WorkbenchService {
  documentRef = deps.document;
  const { vault, document, eventBus } = deps;

  return {
    getActiveDocumentId(paneId) {
      const editor = useEditorStore.getState();
      const pid = paneId ?? editor.activePaneId;
      return editor.activeTabIdByPane[pid] ?? null;
    },

    getActivePaneId() {
      return useEditorStore.getState().activePaneId;
    },

    openInPane(documentId, paneId) {
      const doc = document.get(documentId);
      if (!doc) return;
      ensureDocumentTabInPane(doc, paneId ?? useEditorStore.getState().activePaneId);
    },

    closeTab(documentId, paneId) {
      const editor = useEditorStore.getState();
      const pid = paneId ?? editor.activePaneId;
      const tab = editor.tabs.find((t) => t.documentId === documentId && t.paneId === pid);
      if (!tab) return;

      const inOtherPane = editor.tabs.some(
        (t) => t.documentId === documentId && t.paneId !== pid,
      );
      if (inOtherPane) {
        const tabs = editor.tabs.filter((t) => t.id !== tab.id);
        const map = { ...editor.activeTabIdByPane };
        if (map[pid] === tab.id) {
          const remaining = tabs.filter((t) => t.paneId === pid);
          map[pid] = remaining.length ? remaining[remaining.length - 1]!.id : undefined;
        }
        useEditorStore.setState({ tabs, activeTabIdByPane: map });
        return;
      }

      editor.requestCloseTab(tab.id);
    },

    setActiveTab(documentId, paneId) {
      const pid = paneId ?? useEditorStore.getState().activePaneId;
      const tab = useEditorStore
        .getState()
        .tabs.find((t) => t.documentId === documentId && t.paneId === pid);
      if (!tab) return;
      useEditorStore.getState().setActive(tab.id);
    },

    pinTab(_documentId, _paneId, _pinned) {
      /* Phase 0 stub */
    },

    moveTab(documentId, fromPane, toPane, index) {
      const editor = useEditorStore.getState();
      const tab = editor.tabs.find(
        (t) => t.documentId === documentId && t.paneId === fromPane,
      );
      if (!tab) return;
      editor.moveTabToPane(tab.id, toPane);
    },

    reorderTab(_documentId, _paneId, _newIndex) {
      /* Phase 0 stub */
    },

    splitRight(_fromPaneId) {
      return useEditorStore.getState().splitRight();
    },

    async closePane(paneId, disposition) {
      await useEditorStore.getState().closePaneWithDisposition(paneId, disposition);
    },

    updateLayout(patch) {
      applyLayout({ ...readLayoutFromUi(), ...patch });
    },

    buildSession() {
      const editor = useEditorStore.getState();
      if (editor.tabs.length === 0) {
        return null;
      }

      const vaultCtx =
        resolveVaultForSession(vault) ??
        lastPersistedVault ??
        (() => {
          const fileTab = editor.tabs.find((t) => t.path);
          if (!fileTab?.path) return null;
          const parent = fileTab.path.slice(0, fileTab.path.lastIndexOf("/"));
          return parent ? { id: "inferred", rootPath: normalizeVaultPath(parent) } : null;
        })() ?? { id: "", rootPath: "" };
      const panes: PersistedPane[] = editor.panes.map((paneId) => {
        const paneTabs = editor.tabs.filter((t) => t.paneId === paneId);
        const tabs = paneTabs
          .map((t, order) => buildPersistedTab(t.id, order))
          .filter((t): t is PersistedTabRef => t !== null);
        const activeId = editor.activeTabIdByPane[paneId];
        const activeTabIndex = paneTabs.findIndex((t) => t.id === activeId);
        return {
          id: paneId,
          tabs,
          activeTabIndex: activeTabIndex >= 0 ? activeTabIndex : Math.max(0, tabs.length - 1),
        };
      });

      return {
        version: 2,
        vaultId: vaultCtx.id,
        vaultRootPath: vaultCtx.rootPath,
        savedAt: new Date().toISOString(),
        layout: readLayoutFromUi(),
        panes,
        activePaneId: editor.activePaneId,
      };
    },

    async restoreSession(session) {
      if (restoreInflight) {
        perfLog("workbench.restoreSession deduped (in-flight)");
        return restoreInflight;
      }

      restoreInflight = perfAsync("workbench.restoreSession", async () => {
        sessionPersistSuspended = true;
        let restoreSucceeded = false;
        try {
          const payload = session !== undefined ? session : await loadWorkspaceSession();
          if (!payload) {
            await perfAsync("workbench.restoreLegacyOnly", () => restoreLegacyOnly());
            useEditorStore.setState({ sessionRestored: true });
            eventBus.emit({ type: "workbench:session-restored" });
            perfLog("workbench.restoreSession no-v2-session");
            return false;
          }

          const savedRoot = normalizeVaultPath(payload.vaultRootPath || "");
          if (savedRoot) {
            const current = vault.getCurrent();
            if (!current || normalizeVaultPath(current.rootPath) !== savedRoot) {
              try {
                await perfAsync("workbench.restoreSession.vault.open", () => vault.open(savedRoot), {
                  savedRoot,
                });
              } catch (e) {
                console.warn("Session vault open failed, restoring tabs anyway", e);
                perfLog("workbench.restoreSession.vault.open failed", {
                  error: e instanceof Error ? e.message : String(e),
                });
              }
            } else {
              perfLog("workbench.restoreSession.vault.open skipped (already open)", { savedRoot });
            }
          }

          applyLayout(payload.layout);
          perfLog("workbench.restoreSession.layout applied");

          const paneIds = payload.panes.length ? payload.panes.map((p) => p.id) : [MAIN_PANE_ID];
          useEditorStore.setState({
            panes: paneIds,
            activePaneId: payload.activePaneId || paneIds[0]!,
            tabs: [],
            activeTabIdByPane: {},
          });

          const activeMap: Record<string, string | undefined> = {};

          const paneOrder = [...payload.panes].sort((a, b) => {
            if (a.id === payload.activePaneId) return -1;
            if (b.id === payload.activePaneId) return 1;
            return 0;
          });

          let activeTabCount = 0;
          let deferredTabCount = 0;

          for (const pane of paneOrder) {
            const sorted = [...pane.tabs].sort((a, b) => a.order - b.order);
            const activeIdx = Math.min(
              Math.max(0, pane.activeTabIndex),
              Math.max(0, sorted.length - 1),
            );
            const activeRef = sorted[activeIdx];
            for (const tabRef of sorted) {
              try {
                if (tabRef === activeRef) {
                  activeTabCount += 1;
                  await perfAsync(
                    "workbench.restoreTabRef.active",
                    () => restoreTabRef(tabRef, pane.id, document),
                    {
                      paneId: pane.id,
                      vaultPath: tabRef.vaultPath ?? "(scratch)",
                    },
                  );
                } else {
                  deferredTabCount += 1;
                  const end = perfStart("workbench.mountDeferredTabShell", {
                    paneId: pane.id,
                    vaultPath: tabRef.vaultPath ?? "(scratch)",
                  });
                  mountDeferredTabShell(tabRef, pane.id);
                  end();
                }
              } catch (e) {
                console.error("Failed to restore tab", tabRef, e);
                perfLog("workbench.restoreTab failed", {
                  error: e instanceof Error ? e.message : String(e),
                });
              }
            }
            const paneTabs = useEditorStore.getState().tabs.filter((t) => t.paneId === pane.id);
            const idx = Math.min(
              Math.max(0, pane.activeTabIndex),
              Math.max(0, paneTabs.length - 1),
            );
            if (paneTabs[idx]) {
              activeMap[pane.id] = paneTabs[idx]!.id;
            }
          }

          perfLog("workbench.restoreSession.tabs", { activeTabCount, deferredTabCount });

          useEditorStore.setState({
            activeTabIdByPane: activeMap,
            activePaneId: payload.activePaneId,
            sessionRestored: true,
          });

          if (savedRoot) {
            lastPersistedVault = { id: payload.vaultId, rootPath: savedRoot };
          }

          if (useEditorStore.getState().tabs.length > 0) {
            await clearLegacyScratchSession();
          }
          restoreSucceeded = true;
          captureAllOpenTabViewStates();
          seedPersistedSessionSnapshot(this.buildSession());
          eventBus.emit({ type: "workbench:session-restored" });
          return true;
        } catch (e) {
          console.error("restoreSession failed", e);
          perfLog("workbench.restoreSession.error", {
            error: e instanceof Error ? e.message : String(e),
          });
          useEditorStore.setState({ sessionRestored: true });
          return false;
        } finally {
          sessionPersistSuspended = false;
          if (!useEditorStore.getState().sessionRestored) {
            useEditorStore.setState({ sessionRestored: true });
          }
          if (!restoreSucceeded && useEditorStore.getState().tabs.length === 0) {
            console.warn("Session restore failed with no tabs — keeping saved session intact");
          }
        }
      });

      return restoreInflight;
    },

    async persistSession(reason: SessionPersistReason = "immediate") {
      return perfAsync(
        "workbench.persistSession",
        async () => {
          if (sessionPersistSuspended) return;
          if (!useEditorStore.getState().sessionRestored) return;

          captureAllOpenTabViewStates();
          const session = this.buildSession();
          const editor = useEditorStore.getState();

          if (!session) {
            if (editor.tabs.length === 0) {
              if (lastPersistedSessionFingerprint !== null) {
                await saveWorkspaceSession(null);
                lastPersistedSessionFingerprint = null;
              } else {
                perfLog("workbench.persistSession skipped (unchanged)", { reason });
              }
            }
            return;
          }

          const fingerprint = sessionFingerprint(session);
          if (fingerprint === lastPersistedSessionFingerprint) {
            perfLog("workbench.persistSession skipped (unchanged)", { reason });
            return;
          }

          await saveWorkspaceSession(session);
          lastPersistedSessionFingerprint = fingerprint;
          lastPersistedVault = {
            id: session.vaultId,
            rootPath: normalizeVaultPath(session.vaultRootPath),
          };
        },
        { tabCount: useEditorStore.getState().tabs.length, reason },
      );
    },

    async persistSessionNow() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      scheduledPersistReason = "layout";
      await this.persistSession("immediate");
    },

    schedulePersist(reason: SessionPersistReason = "layout") {
      if (sessionPersistSuspended) return;
      scheduledPersistReason = reason === "content" ? "content" : "layout";

      const delay =
        scheduledPersistReason === "content"
          ? SESSION_PERSIST_CONTENT_DEBOUNCE_MS
          : SESSION_PERSIST_LAYOUT_DEBOUNCE_MS;

      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        const logReason = scheduledPersistReason;
        scheduledPersistReason = "layout";
        persistTimer = null;
        void this.persistSession(logReason);
      }, delay);
    },
  };
}

async function restoreTabRef(
  tabRef: PersistedTabRef,
  paneId: string,
  document: DocumentService,
): Promise<void> {
  if (tabRef.vaultPath) {
    const mode = tabRef.viewState?.mode;
    const doc = await document.open(tabRef.vaultPath, {
      paneId,
      initialMode: mode,
      restoreSession: true,
    });
    if (tabRef.viewState) {
      document.updateViewState(doc.id, tabRef.viewState);
    }
    ensureDocumentTabInPane(document.get(doc.id)!, paneId);
    syncDocumentToEditorTabs(document.get(doc.id)!);
    return;
  }

  const scratchKey = tabRef.scratchId;
  if (scratchKey || tabRef.ephemeral) {
    const scratchData = await loadScratchRestoreData(tabRef);
    const doc = createEphemeralFromScratchRestore(document, paneId, scratchData);
    ensureDocumentTabInPane(document.get(doc.id)!, paneId);
  }
}

async function restoreLegacyOnly(): Promise<void> {
  const legacy = await loadLegacyScratchSession();
  if (!legacy) return;

  useEditorStore.setState({
    panes: legacy.panes,
    activePaneId: legacy.activePaneId,
    tabs: [],
    activeTabIdByPane: {},
  });

  for (const meta of legacy.scratchTabs) {
    const doc = documentRef.createEphemeral({
      paneId: meta.paneId,
      title: meta.displayName,
      content: meta.content,
      initialMode: normalizeSurfaceMode(meta.previewMode),
    });
    ensureDocumentTabInPane(doc, meta.paneId);
  }

  const editor = useEditorStore.getState();
  const map: Record<string, string | undefined> = {};
  for (const pane of legacy.panes) {
    const paneTabs = editor.tabs.filter((t) => t.paneId === pane);
    map[pane] = paneTabs[paneTabs.length - 1]?.id;
  }
  useEditorStore.setState({ activeTabIdByPane: map });
}

export type WorkbenchServiceImpl = ReturnType<typeof createWorkbenchService>;

/** Reset guard for tests / strict mode double mount. */
export function resetWorkbenchRestoreGuard(): void {
  restoreInflight = null;
  sessionPersistSuspended = false;
}
