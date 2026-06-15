import type { DialogRequest, DialogService } from "./types";
import { useDialogStore } from "./dialog-store";

const CLOSE_KINDS = new Set<DialogRequest["kind"]>(["confirm-close", "close-pane"]);

function isCloseKind(kind: DialogRequest["kind"]): boolean {
  return CLOSE_KINDS.has(kind);
}

export function createDialogService(): DialogService {
  return {
    open(request) {
      const { active, queue } = useDialogStore.getState();

      if (isCloseKind(request.kind)) {
        const filteredQueue = queue.filter((item) => !isCloseKind(item.kind));
        const filteredActive = active && isCloseKind(active.kind) ? null : active;
        if (!filteredActive) {
          useDialogStore.getState().setActive(request);
          useDialogStore.getState().setQueue(filteredQueue);
          return;
        }
        useDialogStore.getState().setQueue([...filteredQueue, request]);
        return;
      }

      if (!active) {
        useDialogStore.getState().setActive(request);
        return;
      }
      useDialogStore.getState().setQueue([...queue, request]);
    },

    closeTop() {
      const { queue } = useDialogStore.getState();
      const next = queue[0] ?? null;
      useDialogStore.getState().setActive(next);
      useDialogStore.getState().setQueue(next ? queue.slice(1) : []);
    },

    closeAll() {
      useDialogStore.getState().setActive(null);
      useDialogStore.getState().setQueue([]);
    },

    isOpen() {
      return useDialogStore.getState().active !== null;
    },

    getQueueLength() {
      const { active, queue } = useDialogStore.getState();
      return (active ? 1 : 0) + queue.length;
    },
  };
}

export type DialogServiceImpl = ReturnType<typeof createDialogService>;
