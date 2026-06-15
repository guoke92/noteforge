import { isTauri } from "@/ipc";

export type VaultWatchEvent =
  | { kind: "modified"; path: string }
  | { kind: "created"; path: string }
  | { kind: "deleted"; path: string }
  | { kind: "renamed"; oldPath: string; newPath: string };

export async function subscribeVaultWatch(
  onEvent: (event: VaultWatchEvent) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};

  const { listen } = await import("@tauri-apps/api/event");
  return listen<VaultWatchEvent>("vault-file-event", (event) => {
    onEvent(event.payload);
  });
}

export async function startVaultRootWatch(rootPath: string): Promise<void> {
  if (!isTauri()) return;
  const { vaultWatch } = await import("@/ipc");
  await vaultWatch.start(rootPath);
}

export async function stopVaultRootWatch(): Promise<void> {
  if (!isTauri()) return;
  const { vaultWatch } = await import("@/ipc");
  await vaultWatch.stop();
}
