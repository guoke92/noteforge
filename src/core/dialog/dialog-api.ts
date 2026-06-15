import { getCore } from "@/core/runtime";
import type { DocumentId } from "../events";

export function openConfirmCloseDialog(documentId: DocumentId): void {
  getCore().dialog.open({ kind: "confirm-close", documentId });
}

export function openSaveAsDialog(documentId: DocumentId): void {
  getCore().dialog.open({ kind: "save-as", documentId });
}

export function openClosePaneDialog(paneId: string): void {
  getCore().dialog.open({ kind: "close-pane", paneId });
}

export function openConflictDialog(documentId: DocumentId): void {
  const conflict = getCore().document.getConflict(documentId);
  if (!conflict) return;
  getCore().dialog.open({ kind: "conflict", conflict });
}

export function openConfirmDeleteDialog(path: string): void {
  getCore().dialog.open({ kind: "confirm-delete", path });
}

export function closeDialog(): void {
  getCore().dialog.closeTop();
}

export function closeAllDialogs(): void {
  getCore().dialog.closeAll();
}
