import type { ConflictInfo, ConflictResolution } from "../document/types";
import { getCore } from "../runtime";

export type DraftRestoreChoice = "disk" | "cache";
export type SaveConflictChoice = "reload-from-disk" | "overwrite-disk" | "cancel";

let pendingDraftRestore: ((choice: DraftRestoreChoice) => void) | null = null;
let pendingSaveConflict: ((choice: SaveConflictChoice) => void) | null = null;

export function promptDraftRestoreConflict(conflict: ConflictInfo): Promise<DraftRestoreChoice> {
  return new Promise((resolve) => {
    pendingDraftRestore = resolve;
    getCore().dialog.open({ kind: "draft-restore-conflict", conflict });
  });
}

export function completeDraftRestoreChoice(choice: DraftRestoreChoice): void {
  pendingDraftRestore?.(choice);
  pendingDraftRestore = null;
  getCore().dialog.closeTop();
}

export function promptSaveConflict(conflict: ConflictInfo): Promise<SaveConflictChoice> {
  return new Promise((resolve) => {
    pendingSaveConflict = resolve;
    getCore().dialog.open({ kind: "save-conflict", conflict });
  });
}

export function completeSaveConflictChoice(choice: SaveConflictChoice): void {
  pendingSaveConflict?.(choice);
  pendingSaveConflict = null;
  getCore().dialog.closeTop();
}

export function mapSaveChoiceToResolution(choice: SaveConflictChoice): ConflictResolution | null {
  if (choice === "reload-from-disk") return "reload-from-disk";
  if (choice === "overwrite-disk") return "keep-local";
  return null;
}
