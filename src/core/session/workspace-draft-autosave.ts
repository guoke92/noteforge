/**
 * Layer A — workspace file **draft** cache (not written to disk until manual save).
 */
import { draft } from "@/ipc";
import type { WorkspaceDraftPayload } from "@/types";
import { getCore } from "@/core/runtime";
import { getTierConfig } from "@/core/document/file-tier";
import { createDebouncedFlush } from "./debounced-flush";

const draftFlush = createDebouncedFlush<string>({
  getDebounceMs(vaultPath) {
    const doc = getCore().document.list().find((d) => d.vaultPath === vaultPath);
    return doc ? getTierConfig(doc.tier).draftDebounceMs : 1500;
  },
  shouldFlush(vaultPath) {
    const doc = getCore().document.list().find((d) => d.vaultPath === vaultPath);
    return !!doc?.vaultPath && doc.dirty && doc.contentLoaded;
  },
  async flush(vaultPath) {
    const doc = getCore().document.list().find((d) => d.vaultPath === vaultPath);
    if (!doc?.vaultPath || !doc.dirty || !doc.contentLoaded) return;

    const payload: WorkspaceDraftPayload = {
      vaultPath,
      content: doc.content,
      language: doc.language,
      diskMtime: doc.disk?.mtime,
      diskSize: doc.fileSize,
    };
    try {
      await draft.saveBuffer(payload);
      void import("@/core/local-history/service").then(({ saveHistorySnapshot }) => {
        void saveHistorySnapshot(vaultPath, doc.content);
      });
    } catch (e) {
      console.error("workspace draft autosave failed", e);
    }
  },
});

export function scheduleWorkspaceDraftAutosave(vaultPath: string): void {
  draftFlush.schedule(vaultPath);
}

export async function flushWorkspaceDraft(vaultPath: string): Promise<void> {
  await draftFlush.ensureFlushed(vaultPath);
}

export async function ensureWorkspaceDraftFlushed(vaultPath: string): Promise<void> {
  await draftFlush.ensureFlushed(vaultPath);
}

export async function flushAllDirtyWorkspaceDrafts(): Promise<void> {
  const paths = [
    ...new Set(
      getCore()
        .document.list()
        .filter((d) => d.vaultPath && d.dirty && d.contentLoaded)
        .map((d) => d.vaultPath!),
    ),
  ];
  await Promise.all(paths.map((p) => ensureWorkspaceDraftFlushed(p)));
}

export async function deleteWorkspaceDraft(vaultPath: string): Promise<void> {
  draftFlush.cancel(vaultPath);
  try {
    await draft.deleteBuffer(vaultPath);
  } catch {
    /* ignore */
  }
}

export function cancelPendingWorkspaceDraftAutosave(): void {
  draftFlush.cancelAll();
}

export async function loadWorkspaceDraft(vaultPath: string): Promise<WorkspaceDraftPayload | null> {
  try {
    return await draft.loadBuffer(vaultPath);
  } catch {
    return null;
  }
}
