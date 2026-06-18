import { EDITOR_CONTENT_DEBOUNCE_MS } from "../platform/timing";

export interface ContentDebouncer {
  schedule(content: string): void;
  flushPending(): void;
  cancel(): void;
  getPending(): string | null;
}

export function createContentDebouncer(opts: {
  debounceMs?: number;
  shouldEmit: (content: string) => boolean;
  onEmit: (content: string) => void;
}): ContentDebouncer {
  const debounceMs = opts.debounceMs ?? EDITOR_CONTENT_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;

  function flushPending() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const value = pending;
    if (value === null) return;
    pending = null;
    if (opts.shouldEmit(value)) {
      opts.onEmit(value);
    }
  }

  return {
    schedule(content) {
      pending = content;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const value = pending;
        if (value === null) return;
        pending = null;
        if (opts.shouldEmit(value)) {
          opts.onEmit(value);
        }
      }, debounceMs);
    },

    flushPending,
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
    },

    getPending() {
      return pending;
    },
  };
}
