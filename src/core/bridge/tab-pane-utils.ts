import type { TabSlotId } from "./tab-id";

export const MAIN_PANE_ID = "pane-1";
export const DEFERRED_DOCUMENT_ID_PREFIX = "deferred-";

export interface TabWithPane {
  id: TabSlotId;
  paneId: string;
}

/** After closing a tab, pick the last remaining tab in that pane as the new active tab. */
export function resolveActiveTabAfterClose<T extends TabWithPane>(
  tabs: T[],
  paneId: string,
  closedTabId: TabSlotId,
): TabSlotId | undefined {
  const remaining = tabs.filter((t) => t.paneId === paneId && t.id !== closedTabId);
  return remaining.length ? remaining[remaining.length - 1]!.id : undefined;
}

/** Update activeTabIdByPane after removing tabs, including a closed tab id. */
export function remapActiveTabsAfterClose<T extends TabWithPane>(
  tabs: T[],
  activeTabIdByPane: Record<string, TabSlotId | undefined>,
  closedTabId?: TabSlotId,
): Record<string, TabSlotId | undefined> {
  const map = { ...activeTabIdByPane };
  for (const pane of Object.keys(map)) {
    if (map[pane] === closedTabId || (map[pane] && !tabs.some((t) => t.id === map[pane]))) {
      const remaining = tabs.filter((t) => t.paneId === pane);
      map[pane] = remaining.length ? remaining[remaining.length - 1]!.id : undefined;
    }
  }
  return map;
}
