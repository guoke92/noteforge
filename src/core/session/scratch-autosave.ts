/**
 * Layer A — ephemeral / scratch **content** persistence (VS Code untitled buffers).
 * Stores buffer bytes only; tab list lives in window session (Layer B).
 */
import { scratch } from "@/ipc";
import type { ScratchBufferPayload } from "@/types";
import { useEditorStore, isDirty } from "@/store/editor";
import { getCore } from "@/core/runtime";
import { SCRATCH_AUTOSAVE_DEBOUNCE_MS } from "@/core/platform/timing";
import { createDebouncedFlush } from "./debounced-flush";

const scratchFlush = createDebouncedFlush<string>({
  getDebounceMs: () => SCRATCH_AUTOSAVE_DEBOUNCE_MS,
  shouldFlush(scratchId) {
    const tab = useEditorStore.getState().tabs.find((t) => t.scratchId === scratchId);
    return !!tab && tab.kind === "scratch" && isDirty(tab);
  },
  async flush(scratchId) {
    const tab = useEditorStore.getState().tabs.find((t) => t.scratchId === scratchId);
    if (!tab || tab.kind !== "scratch" || !isDirty(tab)) return;

    const doc = getCore().document.get(tab.documentId);
    const payload: ScratchBufferPayload = {
      scratchId,
      displayName: tab.displayName,
      language: tab.language,
      content: doc?.content ?? "",
    };
    try {
      await scratch.saveBuffer(payload);
    } catch (e) {
      console.error("scratch autosave failed", e);
    }
  },
});

export function scheduleScratchAutosave(scratchId: string): void {
  scratchFlush.schedule(scratchId);
}

export async function flushScratchBuffer(scratchId: string): Promise<void> {
  await scratchFlush.ensureFlushed(scratchId);
}

export async function ensureScratchFlushed(scratchId: string): Promise<void> {
  await scratchFlush.ensureFlushed(scratchId);
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
  scratchFlush.cancelAll();
}
