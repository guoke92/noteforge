import type { AppEvent, AppEventType, EventBus } from "../events";

export function createEventBus(): EventBus {
  const allListeners = new Set<(event: AppEvent) => void>();
  const typedListeners = new Map<AppEventType, Set<(event: AppEvent) => void>>();

  return {
    emit(event) {
      for (const listener of allListeners) {
        listener(event);
      }
      const typed = typedListeners.get(event.type);
      if (typed) {
        for (const listener of typed) {
          listener(event);
        }
      }
    },

    subscribe(type, listener) {
      let set = typedListeners.get(type);
      if (!set) {
        set = new Set();
        typedListeners.set(type, set);
      }
      const wrapped = listener as (event: AppEvent) => void;
      set.add(wrapped);
      return () => set!.delete(wrapped);
    },

    subscribeAll(listener) {
      allListeners.add(listener);
      return () => allListeners.delete(listener);
    },
  };
}
