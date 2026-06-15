/**
 * Layer A — workspace file **draft** cache (not written to disk until manual save).
 */
import { draft } from "@/ipc";
import type { WorkspaceDraftPayload } from "@/types";
import { getCore } from "@/core/runtime";

const DRAFT_FLUSH_DEBOUNCE_MS = 1500;

const draftFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const draftFlushInFlight = new Map<string, Promise<void>>();

export function scheduleWorkspaceDraftAutosave(vaultPath: string): void {
  const doc = getCore().document.list().find((d) => d.vaultPath === vaultPath);
  if (!doc?.vaultPath || !doc.dirty) return;

  const prev = draftFlushTimers.get(vaultPath);
  if (prev) clearTimeout(prev);
  draftFlushTimers.set(
    vaultPath,
    setTimeout(() => {
      draftFlushTimers.delete(vaultPath);
      void flushWorkspaceDraft(vaultPath);
    }, DRAFT_FLUSH_DEBOUNCE_MS),
  );
}

export async function flushWorkspaceDraft(vaultPath: string): Promise<void> {
  const inflight = draftFlushInFlight.get(vaultPath);
  if (inflight) return inflight;

  const promise = (async () => {
    const doc = getCore().document.list().find((d) => d.vaultPath === vaultPath);
    if (!doc?.vaultPath || !doc.dirty) return;

    const payload: WorkspaceDraftPayload = {
      vaultPath,
      content: doc.content,
      language: doc.language,
    };
    try {
      await draft.saveBuffer(payload);
    } catch (e) {
      console.error("workspace draft autosave failed", e);
    }
  })();

  draftFlushInFlight.set(vaultPath, promise);
  try {
    await promise;
  } finally {
    draftFlushInFlight.delete(vaultPath);
  }
}

export async function ensureWorkspaceDraftFlushed(vaultPath: string): Promise<void> {
  const prev = draftFlushTimers.get(vaultPath);
  if (prev) clearTimeout(prev);
  draftFlushTimers.delete(vaultPath);
  await flushWorkspaceDraft(vaultPath);
}

export async function flushAllDirtyWorkspaceDrafts(): Promise<void> {
  const paths = [
    ...new Set(
      getCore()
        .document.list()
        .filter((d) => d.vaultPath && d.dirty)
        .map((d) => d.vaultPath!),
    ),
  ];
  await Promise.all(paths.map((p) => ensureWorkspaceDraftFlushed(p)));
}

export async function deleteWorkspaceDraft(vaultPath: string): Promise<void> {
  const prev = draftFlushTimers.get(vaultPath);
  if (prev) clearTimeout(prev);
  draftFlushTimers.delete(vaultPath);
  try {
    await draft.deleteBuffer(vaultPath);
  } catch {
    /* ignore */
  }
}

export function cancelPendingWorkspaceDraftAutosave(): void {
  for (const timer of draftFlushTimers.values()) {
    clearTimeout(timer);
  }
  draftFlushTimers.clear();
}

export async function loadWorkspaceDraft(vaultPath: string): Promise<WorkspaceDraftPayload | null> {
  try {
    return await draft.loadBuffer(vaultPath);
  } catch {
    return null;
  }
}
