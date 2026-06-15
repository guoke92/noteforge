import type { DocumentId, VaultPath } from "../events";

/** ADR-001: Canonical persisted form is always Markdown text. */
export type DocumentContent = string;

export type EditorSurfaceMode = "write" | "source" | "read";

export type EndOfLine = "lf" | "crlf";

export type DocumentLifecycle =
  | "ephemeral" // vaultPath === null, not yet saved to disk
  | "persisted"
  | "conflict"
  | "deleted-externally";

export interface CursorAnchor {
  /** 1-based line in canonical markdown. */
  line: number;
  /** 1-based column in UTF-16 code units (Monaco/CM6 compatible). */
  column: number;
}

export interface ScrollAnchor {
  scrollTop: number;
  scrollLeft?: number;
}

/** Per-document view state restored with session. ADR-006 */
export interface ViewState {
  mode: EditorSurfaceMode;
  cursor?: CursorAnchor;
  selection?: { anchor: CursorAnchor; head: CursorAnchor };
  scroll?: ScrollAnchor;
}

/** Disk snapshot used for conflict detection. */
export interface DiskSnapshot {
  revision: string; // hash or `${mtime}:${size}`
  content: DocumentContent;
  encoding: "utf-8";
  eol: EndOfLine;
}

/**
 * ADR-002: Document owns content + dirty + viewState.
 * Vault owns path existence and filesystem metadata.
 */
export interface DocumentRecord {
  id: DocumentId;
  /** null = ephemeral (Untitled). ADR-004: at most one instance per vaultPath when non-null. */
  vaultPath: VaultPath | null;
  title: string;
  content: DocumentContent;
  baseline: DocumentContent;
  dirty: boolean;
  lifecycle: DocumentLifecycle;
  disk: DiskSnapshot | null;
  viewState: ViewState;
  /** Derived; markdown notes default to "markdown". */
  language: string;
  createdAt: number;
  updatedAt: number;
}

export type ContentPatch =
  | { kind: "replace-all"; content: DocumentContent }
  | { kind: "replace-range"; start: number; end: number; insert: string };

export interface OpenDocumentOptions {
  paneId?: string;
  /** Restore prior view state from session when available. */
  restoreViewState?: boolean;
  /** Initial mode when creating ephemeral documents. */
  initialMode?: EditorSurfaceMode;
}

export interface CreateEphemeralOptions {
  /** Restore session: reuse stable scratch id as document id. */
  id?: DocumentId;
  paneId?: string;
  title?: string;
  content?: DocumentContent;
  initialMode?: EditorSurfaceMode;
}

export type SaveTarget =
  | { kind: "in-place" }
  | { kind: "path"; vaultPath: VaultPath; overwrite?: boolean };

export type ConflictResolution = "reload-from-disk" | "keep-local" | "save-local-as-copy";

export type ConflictReason = "restore" | "save" | "external";

export interface ConflictInfo {
  documentId: DocumentId;
  vaultPath: VaultPath;
  localContent: DocumentContent;
  diskContent: DocumentContent;
  diskRevision: string;
  reason: ConflictReason;
}
