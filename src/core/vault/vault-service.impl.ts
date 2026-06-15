import { fs, isTauri, workspace as workspaceApi } from "@/ipc";
import { useWorkspaceStore } from "@/store/workspace";
import { basename } from "@/lib/utils";
import type { FileEntry } from "@/types";
import type { EventBus, VaultPath } from "../events";
import { buildDiskRevision } from "../document/utils";
import type { VaultDescriptor, VaultTreeNode } from "./types";
import type { VaultService } from "./service";
import {
  startVaultRootWatch,
  stopVaultRootWatch,
  subscribeVaultWatch,
  type VaultWatchEvent,
} from "./vault-watch";

export interface VaultServiceDeps {
  eventBus: EventBus;
}

function toTreeNode(entry: FileEntry): VaultTreeNode {
  return {
    path: entry.path,
    name: entry.name,
    isDir: entry.isDir,
    size: entry.size,
    modified: entry.modified,
    children: entry.children?.map(toTreeNode),
  };
}

export function createVaultService(deps: VaultServiceDeps): VaultService {
  const { eventBus } = deps;
  let current: VaultDescriptor | null = null;
  let watchTimer: ReturnType<typeof setInterval> | null = null;
  const watchSnapshot = new Map<VaultPath, string>();
  let nativeUnlisten: (() => void) | null = null;
  /** Paths currently being written by NoteForge — ignore watcher noise. */
  const selfWritePaths = new Set<VaultPath>();

  function shouldTrackPath(path: VaultPath): boolean {
    return watchSnapshot.size === 0 || watchSnapshot.has(path);
  }

  async function emitChangeIfDiskRevisionChanged(path: VaultPath): Promise<void> {
    if (!shouldTrackPath(path) || selfWritePaths.has(path)) return;

    const knownRev = watchSnapshot.get(path);
    try {
      const { content } = await fs.read(path);
      const info = await fs.info(path);
      const rev = buildDiskRevision(content, info.modified);
      if (knownRev && rev === knownRev) return;
      watchSnapshot.set(path, rev);
      eventBus.emit({ type: "vault:file-changed", vaultPath: path });
    } catch {
      if (knownRev) {
        watchSnapshot.delete(path);
        eventBus.emit({ type: "vault:file-deleted", vaultPath: path });
      }
    }
  }

  function handleNativeWatchEvent(event: VaultWatchEvent): void {
    switch (event.kind) {
      case "modified":
        void emitChangeIfDiskRevisionChanged(event.path);
        break;
      case "created":
        eventBus.emit({ type: "vault:file-created", vaultPath: event.path });
        void useWorkspaceStore.getState().refreshTree();
        break;
      case "deleted":
        if (!shouldTrackPath(event.path)) return;
        watchSnapshot.delete(event.path);
        eventBus.emit({ type: "vault:file-deleted", vaultPath: event.path });
        void useWorkspaceStore.getState().refreshTree();
        break;
      case "renamed":
        if (shouldTrackPath(event.oldPath) || shouldTrackPath(event.newPath)) {
          const revision = watchSnapshot.get(event.oldPath);
          if (revision) {
            watchSnapshot.delete(event.oldPath);
            watchSnapshot.set(event.newPath, revision);
          }
          eventBus.emit({
            type: "vault:file-renamed",
            oldPath: event.oldPath,
            newPath: event.newPath,
          });
          void useWorkspaceStore.getState().refreshTree();
        }
        break;
    }
  }

  async function ensureNativeWatch(): Promise<void> {
    if (!isTauri() || nativeUnlisten) return;
    nativeUnlisten = await subscribeVaultWatch(handleNativeWatchEvent);
  }

  return {
    getCurrent() {
      return current;
    },

    async open(rootPath) {
      const normalized = rootPath.replace(/\/+$/, "");
      let ws = useWorkspaceStore.getState().current;

      const tryOpen = async (): Promise<void> => {
        await useWorkspaceStore.getState().openWorkspace(normalized);
        ws = useWorkspaceStore.getState().current;
      };

      try {
        await tryOpen();
      } catch {
        const name = basename(normalized) || "Vault";
        try {
          await workspaceApi.create(name, normalized);
        } catch {
          /* may already exist in DB */
        }
        await tryOpen();
      }

      if (!ws || ws.path !== normalized) {
        throw new Error(`Failed to open vault: ${normalized}`);
      }
      current = {
        id: ws.id,
        name: ws.name,
        rootPath: ws.path,
        autoIndex: ws.autoIndex,
        excludePatterns: ws.excludePatterns,
      };
      await ensureNativeWatch();
      if (isTauri()) {
        await startVaultRootWatch(rootPath);
      }
      eventBus.emit({ type: "vault:opened", vaultPath: rootPath, vaultId: current.id });
      return current;
    },

    async close() {
      if (!current) return;
      const vaultId = current.id;
      current = null;
      await this.stopWatching();
      eventBus.emit({ type: "vault:closed", vaultId });
    },

    async listRecent() {
      const list = await workspaceApi.list();
      return list.map((w) => ({
        id: w.id,
        name: w.name,
        rootPath: w.path,
        autoIndex: true,
        excludePatterns: [],
      }));
    },

    async readText(path) {
      const { content } = await fs.read(path);
      let modified = "";
      try {
        const info = await fs.info(path);
        modified = info.modified;
      } catch {
        /* ignore */
      }
      return { content, eol: "lf" as const, revision: buildDiskRevision(content, modified) };
    },

    async writeText(path, content) {
      selfWritePaths.add(path);
      try {
        try {
          await fs.write(path, content);
        } catch {
          await fs.create(path, content);
        }
        if (watchSnapshot.has(path)) {
          try {
            const info = await fs.info(path);
            watchSnapshot.set(path, buildDiskRevision(content, info.modified));
          } catch {
            watchSnapshot.set(path, buildDiskRevision(content, ""));
          }
        }
      } finally {
        queueMicrotask(() => selfWritePaths.delete(path));
      }
    },

    async createNote(options) {
      const parent = options.parentDir.replace(/\/$/, "");
      const path = `${parent}/${options.filename}`;
      await fs.create(path, options.content ?? "");
      eventBus.emit({ type: "vault:file-created", vaultPath: path });
      await useWorkspaceStore.getState().refreshTree();
      return path;
    },

    async createDirectory(parentDir, name) {
      const path = `${parentDir.replace(/\/$/, "")}/${name}`;
      await useWorkspaceStore.getState().createDir(parentDir, name);
      eventBus.emit({ type: "vault:file-created", vaultPath: path });
      return path;
    },

    async rename(oldPath, options) {
      const parent = oldPath.slice(0, oldPath.lastIndexOf("/"));
      const newPath = `${parent}/${options.newName}`;
      await fs.rename(oldPath, newPath);
      eventBus.emit({ type: "vault:file-renamed", oldPath, newPath });
      await useWorkspaceStore.getState().refreshTree();
      return newPath;
    },

    async delete(path) {
      await fs.remove(path);
      watchSnapshot.delete(path);
      eventBus.emit({ type: "vault:file-deleted", vaultPath: path });
      await useWorkspaceStore.getState().refreshTree();
    },

    getTree() {
      const tree = useWorkspaceStore.getState().tree;
      return tree ? toTreeNode(tree) : null;
    },

    async loadChildren(dirPath) {
      const entries = await fs.list(dirPath);
      return entries.map(toTreeNode);
    },

    async pickVaultRoot() {
      if (isTauri()) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({ directory: true, multiple: false });
        if (!selected || Array.isArray(selected)) return null;
        return selected;
      }
      const path = window.prompt("选择知识库文件夹路径");
      return path?.trim() || null;
    },

    async pickSavePath(defaultName, parentDir) {
      if (isTauri()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const dir = parentDir ?? current?.rootPath ?? undefined;
        const defaultPath = dir ? `${dir.replace(/\/$/, "")}/${defaultName}` : defaultName;
        return save({ defaultPath });
      }
      const base = parentDir ?? current?.rootPath ?? "";
      const path = window.prompt("保存路径", base ? `${base}/${defaultName}` : defaultName);
      return path?.trim() || null;
    },

    async startWatching() {
      if (isTauri()) return;
      if (watchTimer) return;
      watchTimer = setInterval(async () => {
        if (!current) return;
        for (const [path, prevRev] of watchSnapshot) {
          try {
            const { content } = await fs.read(path);
            const info = await fs.info(path);
            const rev = buildDiskRevision(content, info.modified);
            if (rev !== prevRev) {
              watchSnapshot.set(path, rev);
              eventBus.emit({ type: "vault:file-changed", vaultPath: path });
            }
          } catch {
            watchSnapshot.delete(path);
            eventBus.emit({ type: "vault:file-deleted", vaultPath: path });
          }
        }
      }, 3000);
    },

    async stopWatching() {
      if (isTauri()) {
        await stopVaultRootWatch();
        if (nativeUnlisten) {
          nativeUnlisten();
          nativeUnlisten = null;
        }
        return;
      }
      if (watchTimer) {
        clearInterval(watchTimer);
        watchTimer = null;
      }
      watchSnapshot.clear();
    },

    trackForWatch(path, revision) {
      watchSnapshot.set(path, revision);
      if (!isTauri()) {
        void this.startWatching();
      }
    },

    untrackForWatch(path) {
      watchSnapshot.delete(path);
    },
  };
}

export type VaultServiceImpl = ReturnType<typeof createVaultService>;
