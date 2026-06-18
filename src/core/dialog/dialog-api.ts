import { getCore } from "@/core/runtime";
import type { DocumentId } from "../events";
import type { TabSlotId } from "../bridge/tab-id";

export function openConfirmCloseDialog(tabId: TabSlotId): void {
  getCore().dialog.open({ kind: "confirm-close", tabId });
}

export function openSaveAsDialog(tabId: TabSlotId): void {
  getCore().dialog.open({ kind: "save-as", tabId });
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
