// Core domain contracts — Phase 0 implementation target.
// Legacy code in src/store/* remains until bridge is complete.

export * from "./events";
export * from "./invariants";

export * from "./document/types";
export type { DocumentService } from "./document/service";

export * from "./vault/types";
export type { VaultService } from "./vault/service";

export { createWorkbenchService, resetWorkbenchRestoreGuard } from "./workbench/workbench-service.impl";
export type { WorkbenchServiceImpl } from "./workbench/workbench-service.impl";
export * from "./workbench/session-storage";
export * from "./workbench/types";
export type { WorkbenchService, TabCloseRequest } from "./workbench/service";

export * from "./command/types";
export { createCommandRegistry, COMMAND_CATEGORIES } from "./command/command-registry.impl";
export { registerCoreCommands } from "./command/register-core-commands";
export { buildCommandContext } from "./command/context";
export { MOD_LABEL, ALT_LABEL, SHIFT_LABEL, formatChord } from "./command/keybinding";

export * from "./dialog/types";
export {
  openConfirmCloseDialog,
  openSaveAsDialog,
  openClosePaneDialog,
  openConflictDialog,
  openConfirmDeleteDialog,
  closeDialog,
  closeAllDialogs,
} from "./dialog/dialog-api";
export { createDialogService } from "./dialog/dialog-service.impl";

export * from "./knowledge/types";
export { createKnowledgeQueryService, wireKnowledgeIndexer } from "./knowledge/knowledge-query.impl";
export { openDailyNote, formatDailyNoteDate } from "./note/daily-note";

export * from "./editor/types";

export * from "./platform/config";

export { createEventBus } from "./platform/event-bus";
export { createVaultService } from "./vault/vault-service.impl";
export { createDocumentService } from "./document/document-service.impl";
export {
  initCore,
  getCore,
  isCoreInitialized,
  openVault,
  pickAndOpenVault,
  openDocumentInPane,
  createUntitledInPane,
  saveDocument,
  flushCoreBeforeExit,
  restoreWorkspaceSession,
  scheduleWorkspacePersist,
} from "./runtime";
export type { CoreRuntime } from "./runtime";
