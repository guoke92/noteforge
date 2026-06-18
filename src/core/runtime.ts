import { createEventBus } from "./platform/event-bus";
import { createVaultService } from "./vault/vault-service.impl";
import { createDocumentService } from "./document/document-service.impl";
import { createWorkbenchService } from "./workbench/workbench-service.impl";
import type { EventBus } from "./events";
import type { DocumentService } from "./document/service";
import type { VaultService } from "./vault/service";
import type { WorkbenchService } from "./workbench/service";
import type { WorkspaceSession } from "./workbench/types";
import type { CommandRegistry } from "./command/types";
import { createCommandRegistry } from "./command/command-registry.impl";
import { registerCoreCommands } from "./command/register-core-commands";
import { createDialogService } from "./dialog/dialog-service.impl";
import type { DialogService } from "./dialog/types";
import { openSaveAsDialog } from "./dialog/dialog-api";
import { isTauri } from "@/ipc";
import {
  createKnowledgeQueryService,
  wireKnowledgeIndexer,
} from "./knowledge/knowledge-query.impl";
import type { KnowledgeQueryService } from "./knowledge/types";
import { createEditorHostService } from "./editor/editor-host.impl";
import type { EditorHostServiceImpl } from "./editor/editor-host.impl";
import {
  ensureDocumentTabInPane,
  removeDocumentFromEditor,
  syncDocumentToEditorTabs,
} from "./bridge/editor-sync";
import { perfSync } from "@/lib/startup-perf";

export interface CoreRuntime {
  eventBus: EventBus;
  vault: VaultService;
  document: DocumentService;
  workbench: WorkbenchService;
  commands: CommandRegistry;
  dialog: DialogService;
  knowledge: KnowledgeQueryService;
  editorHost: EditorHostServiceImpl;
}

let runtime: CoreRuntime | null = null;
let knowledgeUnwire: (() => void) | null = null;

export function initCore(): CoreRuntime {
  if (runtime) return runtime;

  return perfSync("core.initCore", () => {
  const eventBus = createEventBus();
  const vault = createVaultService({ eventBus });
  const document = createDocumentService({
    eventBus,
    vault,
    onDocumentsChanged: (documentId) => {
      const doc = document.get(documentId);
      if (doc) syncDocumentToEditorTabs(doc);
    },
  });

  const workbench = createWorkbenchService({ eventBus, vault, document });
  const commands = createCommandRegistry();
  const dialog = createDialogService();
  const knowledge = createKnowledgeQueryService({ eventBus, vault, document });
  knowledgeUnwire?.();
  knowledgeUnwire = wireKnowledgeIndexer(eventBus, knowledge);
  const editorHost = createEditorHostService({ document });
  registerCoreCommands(commands);

  eventBus.subscribe("document:conflict", (event) => {
    const conflict = document.getConflict(event.documentId);
    if (!conflict || conflict.reason !== "external") return;
    dialog.open({ kind: "conflict", conflict });
  });

  eventBus.subscribe("document:closed", (event) => {
    removeDocumentFromEditor(event.documentId);
    void import("@/store/large-file-overrides").then(({ useLargeFileOverrides }) => {
      useLargeFileOverrides.getState().clearDocument(event.documentId);
    });
    void workbench.persistSessionNow();
  });

  eventBus.subscribe("document:opened", (event) => {
    const doc = document.get(event.documentId);
    if (doc?.vaultPath) {
      void import("@/core/local-history/service").then(({ startAutoSnapshot }) => {
        startAutoSnapshot(doc.vaultPath!, () => {
          const current = document.get(event.documentId);
          return current ? { content: current.content, dirty: current.dirty } : null;
        });
      });
    }
  });

  eventBus.subscribe("document:changed", (event) => {
    workbench.schedulePersist("content");
    const doc = document.get(event.documentId);
    if (!doc?.vaultPath) {
      void import("@/store/editor").then(({ useEditorStore, isDirty }) => {
        const tab = useEditorStore.getState().tabs.find((t) => t.documentId === event.documentId);
        if (tab?.kind === "scratch" && tab.scratchId && isDirty(tab)) {
          void import("@/core/session/scratch-autosave").then(({ scheduleScratchAutosave }) => {
            scheduleScratchAutosave(tab.scratchId!);
          });
        }
      });
    } else if (doc.dirty) {
      void import("@/core/session/workspace-draft-autosave").then(
        ({ scheduleWorkspaceDraftAutosave }) => {
          scheduleWorkspaceDraftAutosave(doc.vaultPath!);
        },
      );
    }
  });

  runtime = { eventBus, vault, document, workbench, commands, dialog, knowledge, editorHost };
  return runtime;
  });
}

export function getCore(): CoreRuntime {
  if (!runtime) {
    return initCore();
  }
  return runtime;
}

export function isCoreInitialized(): boolean {
  return runtime !== null;
}

export async function openVault(rootPath: string) {
  return getCore().vault.open(rootPath);
}

export async function pickAndOpenVault(): Promise<boolean> {
  const path = await getCore().vault.pickVaultRoot();
  if (!path) return false;
  await getCore().vault.open(path);
  return true;
}

export async function openDocumentInPane(vaultPath: string, paneId: string) {
  const doc = await getCore().document.open(vaultPath, { paneId });
  ensureDocumentTabInPane(doc, paneId);
  await getCore().workbench.persistSessionNow();
  return doc;
}

export function createUntitledInPane(paneId: string) {
  const doc = getCore().document.createEphemeral({ paneId, initialMode: "write" });
  ensureDocumentTabInPane(doc, paneId);
  void getCore().workbench.persistSessionNow();
  return doc;
}

export async function saveDocument(documentId: string): Promise<void> {
  const core = getCore();
  await core.document.ensureContentLoaded(documentId);
  core.editorHost.flushAllSurfacesForDocument(documentId);
  const doc = core.document.get(documentId);
  if (!doc) return;

  if (!doc.vaultPath) {
    const wsPath = core.vault.getCurrent()?.rootPath;
    const { suggestedSaveFileName } = await import("@/lib/editor-doc");
    const { useEditorStore } = await import("@/store/editor");
    const tab = useEditorStore.getState().tabs.find((t) => t.documentId === documentId);
    if (!tab) return;

    const content = doc.content;
    const defaultName = suggestedSaveFileName(tab, content);
    const path = await core.vault.pickSavePath(defaultName, wsPath ?? undefined);
    if (!path) {
      // Tauri: user cancelled native dialog — do not stack in-app SaveAs.
      if (!isTauri()) openSaveAsDialog(tab.id);
      return;
    }
    await core.document.save(documentId, { kind: "path", vaultPath: path });
    syncDocumentToEditorTabs(core.document.get(documentId)!);
    await core.workbench.persistSession();

    // Trigger local history snapshot after successful save-as
    void import("@/core/local-history/service").then(({ saveHistorySnapshot }) => {
      void saveHistorySnapshot(path, doc.content);
    });
    return;
  }

  await core.document.save(documentId, { kind: "in-place" });
  syncDocumentToEditorTabs(core.document.get(documentId)!);
  await core.workbench.persistSession();

  // Trigger local history snapshot after successful save
  const savedDoc = core.document.get(documentId);
  if (savedDoc?.vaultPath) {
    void import("@/core/local-history/service").then(({ saveHistorySnapshot }) => {
      void saveHistorySnapshot(savedDoc.vaultPath!, savedDoc.content);
    });
  }
}

export async function ensureDocumentContentLoaded(documentId: string) {
  const doc = await getCore().document.ensureContentLoaded(documentId);
  if (doc) {
    const { pushContentToSurface } = await import("./bridge/editor-sync");
    pushContentToSurface(doc);
  }
  return doc;
}

export async function flushCoreBeforeExit(): Promise<void> {
  if (!runtime) return;
  const { cancelPendingWorkspaceDraftAutosave } = await import(
    "@/core/session/workspace-draft-autosave"
  );
  cancelPendingWorkspaceDraftAutosave();
  await runtime.document.flushAutoSave();
  await runtime.workbench.persistSessionNow();
}

export async function restoreWorkspaceSession(
  session?: WorkspaceSession | null,
): Promise<boolean> {
  return getCore().workbench.restoreSession(session);
}

export function scheduleWorkspacePersist(reason: "content" | "layout" = "layout"): void {
  getCore().workbench.schedulePersist(reason);
}
