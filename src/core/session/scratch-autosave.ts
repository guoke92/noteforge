/**
 * Layer A — ephemeral / scratch **content** persistence (VS Code untitled buffers).
 * Stores buffer bytes only; tab list lives in window session (Layer B).
 */
import { scratch } from "@/ipc";
import type { ScratchBufferPayload } from "@/types";
import { useEditorStore, isDirty } from "@/store/editor";

const SCRATCH_FLUSH_DEBOUNCE_MS = 1500;

const scratchFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const scratchFlushInFlight = new Map<string, Promise<void>>();

export function scheduleScratchAutosave(scratchId: string): void {
  const tab = useEditorStore.getState().tabs.find((t) => t.scratchId === scratchId);
  if (!tab || tab.kind !== "scratch" || !isDirty(tab)) return;

  const prev = scratchFlushTimers.get(scratchId);
  if (prev) clearTimeout(prev);
  scratchFlushTimers.set(
    scratchId,
    setTimeout(() => {
      scratchFlushTimers.delete(scratchId);
      void flushScratchBuffer(scratchId);
    }, SCRATCH_FLUSH_DEBOUNCE_MS),
  );
}

export async function flushScratchBuffer(scratchId: string): Promise<void> {
  const inflight = scratchFlushInFlight.get(scratchId);
  if (inflight) return inflight;

  const promise = (async () => {
    const tab = useEditorStore.getState().tabs.find((t) => t.scratchId === scratchId);
    if (!tab || tab.kind !== "scratch" || !isDirty(tab)) return;

    const payload: ScratchBufferPayload = {
      scratchId,
      displayName: tab.displayName,
      language: tab.language,
      content: tab.content,
    };
    try {
      await scratch.saveBuffer(payload);
      useEditorStore.setState({
        tabs: useEditorStore.getState().tabs.map((t) =>
          t.scratchId === scratchId ? { ...t, baseline: t.content } : t,
        ),
      });
    } catch (e) {
      console.error("scratch autosave failed", e);
    }
  })();

  scratchFlushInFlight.set(scratchId, promise);
  try {
    await promise;
  } finally {
    scratchFlushInFlight.delete(scratchId);
  }
}

export async function ensureScratchFlushed(scratchId: string): Promise<void> {
  const prev = scratchFlushTimers.get(scratchId);
  if (prev) clearTimeout(prev);
  scratchFlushTimers.delete(scratchId);
  await flushScratchBuffer(scratchId);
}

export async function flushAllDirtyScratchBuffers(): Promise<void> {
  const ids = [
    ...new Set(
      useEditorStore
        .getState()
        .tabs.filter((t) => t.kind === "scratch" && t.scratchId && isDirty(t))
        .map((t) => t.scratchId!),
    ),
  ];
  await Promise.all(ids.map((id) => ensureScratchFlushed(id)));
}

export function cancelPendingScratchAutosave(): void {
  for (const timer of scratchFlushTimers.values()) {
    clearTimeout(timer);
  }
  scratchFlushTimers.clear();
}
