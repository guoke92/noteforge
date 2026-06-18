import { useSyncExternalStore, useCallback } from "react";
import { getCore } from "@/core/runtime";

/**
 * Subscribe to a DocumentRecord's content. Returns null if no document exists.
 * Re-renders only when the specific document changes (via eventBus).
 */
export function useDocumentContent(documentId: string): string | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const eventBus = getCore().eventBus;
      const unsub = eventBus.subscribe("document:changed", (event) => {
        if (event.documentId === documentId) onStoreChange();
      });
      return unsub;
    },
    [documentId],
  );

  const getSnapshot = useCallback(() => {
    return getCore().document.get(documentId)?.content ?? null;
  }, [documentId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Subscribe to a DocumentRecord (full record). Returns null if not found.
 */
export function useDocumentRecord(documentId: string) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const eventBus = getCore().eventBus;
      const unsubChanged = eventBus.subscribe("document:changed", (event) => {
        if (event.documentId === documentId) onStoreChange();
      });
      const unsubOpened = eventBus.subscribe("document:opened", (event) => {
        if (event.documentId === documentId) onStoreChange();
      });
      return () => {
        unsubChanged();
        unsubOpened();
      };
    },
    [documentId],
  );

  const getSnapshot = useCallback(() => {
    return getCore().document.get(documentId);
  }, [documentId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
