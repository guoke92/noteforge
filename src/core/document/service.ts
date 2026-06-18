import type { DocumentId, VaultPath } from "../events";
import type {
  ConflictInfo,
  ConflictResolution,
  ContentPatch,
  CreateEphemeralOptions,
  DocumentRecord,
  OpenDocumentOptions,
  SaveTarget,
  ViewState,
} from "./types";

/**
 * ADR-001 / ADR-002 / ADR-007
 * Single entry for open, edit, save, revert. UI and AI must not call fs directly.
 */
export interface DocumentService {
  /** All open documents keyed by id. */
  list(): DocumentRecord[];

  get(documentId: DocumentId): DocumentRecord | null;

  /** ADR-004: returns existing instance if vaultPath already open. */
  open(vaultPath: VaultPath, options?: OpenDocumentOptions): Promise<DocumentRecord>;

  createEphemeral(options?: CreateEphemeralOptions): DocumentRecord;

  close(documentId: DocumentId, options?: { force?: boolean }): Promise<boolean>;

  applyPatch(documentId: DocumentId, patch: ContentPatch): void;

  /** Load full disk content for huge lazy-open documents before edit/save. */
  ensureContentLoaded(documentId: DocumentId): Promise<DocumentRecord | null>;

  updateViewState(documentId: DocumentId, patch: Partial<ViewState>): void;

  save(documentId: DocumentId, target?: SaveTarget): Promise<VaultPath>;

  /** Post-save binding for SaveAs flows where file was already written.
   *  Updates vaultPath, savedRevision, baseline without conflict detection. */
  saveAs(documentId: DocumentId, vaultPath: VaultPath): Promise<void>;

  revert(documentId: DocumentId): Promise<void>;

  /** Called by vault watcher when file changes on disk. */
  notifyExternalChange(vaultPath: VaultPath): Promise<void>;

  resolveConflict(documentId: DocumentId, resolution: ConflictResolution): Promise<void>;

  /** For dialog layer — do not bypass close flow. */
  getConflict(documentId: DocumentId): ConflictInfo | null;

  flushAutoSave(): Promise<void>;
}
