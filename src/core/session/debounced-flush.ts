export interface DebouncedFlushController<TKey> {
  schedule(key: TKey): void;
  ensureFlushed(key: TKey): Promise<void>;
  cancel(key: TKey): void;
  cancelAll(): void;
}

export function createDebouncedFlush<TKey>(opts: {
  getDebounceMs: (key: TKey) => number;
  shouldFlush: (key: TKey) => boolean;
  flush: (key: TKey) => Promise<void>;
}): DebouncedFlushController<TKey> {
  const timers = new Map<TKey, ReturnType<typeof setTimeout>>();
  const inFlight = new Map<TKey, Promise<void>>();

  async function runFlush(key: TKey): Promise<void> {
    const existing = inFlight.get(key);
    if (existing) return existing;

    const promise = opts.flush(key).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  }

  return {
    schedule(key) {
      if (!opts.shouldFlush(key)) return;

      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          void runFlush(key);
        }, opts.getDebounceMs(key)),
      );
    },

    async ensureFlushed(key) {
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.delete(key);
      await runFlush(key);
    },

    cancelAll() {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    },

    cancel(key) {
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.delete(key);
    },
  };
}
