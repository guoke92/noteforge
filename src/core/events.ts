// ADR-003: Knowledge and UI subscribe to events; they never write documents directly.

/** Stable document identity within a running session. */
export type DocumentId = string;

/** Absolute vault-relative or absolute filesystem path. */
export type VaultPath = string;

export type AppEvent =
  | { type: "vault:opened"; vaultPath: VaultPath; vaultId: string }
  | { type: "vault:closed"; vaultId: string }
  | { type: "document:opened"; documentId: DocumentId; vaultPath: VaultPath | null }
  | { type: "document:closed"; documentId: DocumentId }
  | { type: "document:changed"; documentId: DocumentId; vaultPath: VaultPath | null }
  | { type: "document:saved"; documentId: DocumentId; vaultPath: VaultPath }
  | { type: "document:conflict"; documentId: DocumentId; vaultPath: VaultPath }
  | { type: "document:view-state-changed"; documentId: DocumentId }
  | { type: "vault:file-created"; vaultPath: VaultPath }
  | { type: "vault:file-changed"; vaultPath: VaultPath }
  | { type: "vault:file-deleted"; vaultPath: VaultPath }
  | { type: "vault:file-renamed"; oldPath: VaultPath; newPath: VaultPath }
  | { type: "workbench:session-restored" }
  | { type: "workbench:active-document-changed"; documentId: DocumentId | null; paneId: string };

export type AppEventType = AppEvent["type"];

export interface EventBus {
  emit(event: AppEvent): void;
  subscribe<T extends AppEventType>(
    type: T,
    listener: (event: Extract<AppEvent, { type: T }>) => void,
  ): () => void;
  subscribeAll(listener: (event: AppEvent) => void): () => void;
}
