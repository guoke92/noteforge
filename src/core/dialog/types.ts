import type { ConflictInfo } from "../document/types";
import type { DocumentId, VaultPath } from "../events";

/** Data-only dialog requests — actions handled by DialogHost. */

export type DialogRequest =
  | { kind: "confirm-close"; documentId: DocumentId }
  | { kind: "save-as"; documentId: DocumentId }
  | { kind: "conflict"; conflict: ConflictInfo }
  | { kind: "draft-restore-conflict"; conflict: ConflictInfo }
  | { kind: "save-conflict"; conflict: ConflictInfo }
  | { kind: "confirm-delete"; path: VaultPath }
  | { kind: "close-pane"; paneId: string };

export interface DialogService {
  open(request: DialogRequest): void;
  closeTop(): void;
  closeAll(): void;
  isOpen(): boolean;
  getQueueLength(): number;
}
