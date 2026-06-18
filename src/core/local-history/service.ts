/**
 * Local History Service — cross-restart version snapshots.
 *
 * Snapshot triggers:
 * 1. After manual save
 * 2. Every 5 minutes for dirty documents (auto-interval)
 * 3. After draft flush succeeds
 */
import type { SnapshotMeta } from "./types";
import type { VaultPath } from "@/core/events";

export type { SnapshotMeta };

// IPC will be dynamically imported
let _ipc: typeof import("@/ipc") | null = null;
async function ipc() {
  if (!_ipc) _ipc = await import("@/ipc");
  return _ipc;
}

const AUTO_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const autoTimers = new Map<VaultPath, ReturnType<typeof setInterval>>();

/** Save a snapshot for the given vault path. */
export async function saveHistorySnapshot(
  vaultPath: string,
  content: string,
): Promise<SnapshotMeta | null> {
  try {
    const { history } = await ipc();
    return await history.saveSnapshot(vaultPath, content);
  } catch (err) {
    console.error("history: saveSnapshot failed", err);
    return null;
  }
}

/** List snapshots for a vault path (newest first). */
export async function listHistorySnapshots(
  vaultPath: string,
): Promise<SnapshotMeta[]> {
  try {
    const { history } = await ipc();
    return await history.listSnapshots(vaultPath);
  } catch {
    return [];
  }
}

/** Load snapshot content by timestamp. */
export async function loadHistorySnapshot(
  vaultPath: string,
  timestamp: string,
): Promise<string | null> {
  try {
    const { history } = await ipc();
    return await history.loadSnapshot(vaultPath, timestamp);
  } catch {
    return null;
  }
}

/** Start auto-snapshot interval for a vault path (5 min, only if dirty). */
export function startAutoSnapshot(
  vaultPath: string,
  getContent: () => { content: string; dirty: boolean } | null,
): void {
  if (autoTimers.has(vaultPath)) return;

  const timer = setInterval(async () => {
    const doc = getContent();
    if (!doc || !doc.dirty) return;
    await saveHistorySnapshot(vaultPath, doc.content);
  }, AUTO_INTERVAL_MS);

  autoTimers.set(vaultPath, timer);
}

/** Stop auto-snapshot interval for a vault path. */
export function stopAutoSnapshot(vaultPath: string): void {
  const timer = autoTimers.get(vaultPath);
  if (timer) {
    clearInterval(timer);
    autoTimers.delete(vaultPath);
  }
}

/** Stop all auto-snapshot intervals (app exit). */
export function stopAllAutoSnapshots(): void {
  for (const [_path, timer] of autoTimers) {
    clearInterval(timer);
  }
  autoTimers.clear();
}

/** Delete all history for a vault path. */
export async function deleteHistory(vaultPath: string): Promise<void> {
  try {
    const { history } = await ipc();
    await history.deleteHistory(vaultPath);
  } catch {
    /* ignore */
  }
}
