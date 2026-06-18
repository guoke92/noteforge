import type { DocumentId } from "../events";
import type { LayoutState, PaneId, WorkspaceSession } from "./types";

/**
 * ADR-006 / VS Code-inspired tab & split management.
 * Does not mutate document content — only layout and tab routing.
 */
export type SessionPersistReason = "content" | "layout" | "immediate";

export interface WorkbenchService {
  getActiveDocumentId(paneId?: PaneId): DocumentId | null;

  getActivePaneId(): PaneId;

  openInPane(documentId: DocumentId, paneId?: PaneId): void;

  closeTab(documentId: DocumentId, paneId?: PaneId): void;

  setActiveTab(documentId: DocumentId, paneId?: PaneId): void;

  pinTab(documentId: DocumentId, paneId?: PaneId, pinned?: boolean): void;

  moveTab(documentId: DocumentId, fromPane: PaneId, toPane: PaneId, index?: number): void;

  reorderTab(documentId: DocumentId, paneId: PaneId, newIndex: number): void;

  splitRight(fromPaneId?: PaneId): PaneId;

  closePane(paneId: PaneId, disposition: "merge-to-main" | "close-tabs"): Promise<void>;

  updateLayout(patch: Partial<LayoutState>): void;

  /** Serialize current editor layout + tab refs. */
  buildSession(): WorkspaceSession | null;

  /** Restore after vault opened. Loads stored session when argument omitted. */
  restoreSession(session?: WorkspaceSession | null): Promise<boolean>;

  persistSession(reason?: SessionPersistReason): Promise<void>;

  /** Persist immediately (tab open/close, app exit). */
  persistSessionNow(): Promise<void>;

  schedulePersist(reason?: SessionPersistReason): void;
}

export interface TabCloseRequest {
  documentIds: DocumentId[];
  reason: "user" | "pane-close" | "app-exit";
  onComplete: () => void;
  onCancel: () => void;
}
