import { create } from "zustand";
import type { DialogRequest } from "./types";

interface DialogStoreState {
  active: DialogRequest | null;
  queue: DialogRequest[];
  setActive: (active: DialogRequest | null) => void;
  setQueue: (queue: DialogRequest[]) => void;
}

export const useDialogStore = create<DialogStoreState>(() => ({
  active: null,
  queue: [],
  setActive: (active) => useDialogStore.setState({ active }),
  setQueue: (queue) => useDialogStore.setState({ queue }),
}));

export function subscribeDialogStore(listener: () => void): () => void {
  return useDialogStore.subscribe(listener);
}
