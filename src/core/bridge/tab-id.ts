/** Unique tab slot id (per pane) — not the same as DocumentRecord.id. */
export type TabSlotId = string;

export function newTabSlotId(): TabSlotId {
  return "tab-" + Math.random().toString(36).slice(2, 11);
}
