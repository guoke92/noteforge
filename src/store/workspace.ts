import { create } from "zustand";
import type { FileEntry, WorkspaceConfig, WorkspaceView } from "@/types";
import { fs, workspace as workspaceApi } from "@/ipc";
import { perfAsync, perfLog } from "@/lib/startup-perf";

interface WorkspaceState {
  current: WorkspaceView | null;
  loading: boolean;
  error: string | null;
  tree: FileEntry | null;
  expandedDirs: Set<string>;
  recent: WorkspaceConfig[];

  bootstrap: () => Promise<void>;
  openWorkspace: (path: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  toggleDir: (path: string) => Promise<void>;
  ensureChildren: (path: string) => Promise<void>;
  createFileInDir: (dir: string, name: string, content?: string) => Promise<string>;
  createDir: (parent: string, name: string) => Promise<void>;
  renameEntry: (oldPath: string, newName: string) => Promise<string>;
  deleteEntry: (path: string) => Promise<void>;
}

async function loadDir(path: string): Promise<FileEntry[]> {
  return fs.list(path);
}

function findEntry(root: FileEntry, path: string): FileEntry | null {
  if (root.path === path) return root;
  if (!root.children) return null;
  for (const child of root.children) {
    const found = findEntry(child, path);
    if (found) return found;
  }
  return null;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  current: null,
  loading: false,
  error: null,
  tree: null,
  expandedDirs: new Set<string>(),
  recent: [],

  async bootstrap() {
    set({ loading: true, error: null });
    try {
      const list = await workspaceApi.list();
      set({ recent: list });
      if (list.length > 0) {
        await get().openWorkspace(list[0].path);
      } else {
        set({ loading: false });
      }
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  async openWorkspace(path: string) {
    set({ loading: true, error: null });
    try {
      const ws = await perfAsync("workspace.ipc.open", () => workspaceApi.open(path), { path });
      const rootChildren = await perfAsync("workspace.fs.list-root", () => loadDir(ws.path), {
        path: ws.path,
      });
      const root: FileEntry = {
        path: ws.path,
        name: ws.name,
        isDir: true,
        children: rootChildren,
      };
      set({
        current: ws,
        tree: root,
        expandedDirs: new Set<string>([ws.path]),
        loading: false,
      });
      perfLog("workspace.tree.ready", {
        rootChildren: rootChildren.length,
        autoIndex: ws.autoIndex,
      });
    } catch (e) {
      set({ loading: false, error: String(e) });
      throw e;
    }
  },

  async refreshTree() {
    const { current, expandedDirs } = get();
    if (!current) return;
    const rootChildren = await loadDir(current.path);
    const root: FileEntry = {
      path: current.path,
      name: current.name,
      isDir: true,
      children: rootChildren,
    };

    async function hydrate(entry: FileEntry): Promise<void> {
      if (!entry.isDir) return;
      if (!expandedDirs.has(entry.path)) return;
      const children = await loadDir(entry.path);
      entry.children = children;
      await Promise.all(children.filter((c) => c.isDir).map(hydrate));
    }
    await hydrate(root);

    set({ tree: root });
  },

  async toggleDir(path: string) {
    const { expandedDirs } = get();
    const next = new Set(expandedDirs);
    if (next.has(path)) next.delete(path);
    else {
      next.add(path);
      await get().ensureChildren(path);
    }
    set({ expandedDirs: next });
  },

  async ensureChildren(path: string) {
    const tree = get().tree;
    if (!tree) return;
    const target = findEntry(tree, path);
    if (!target || !target.isDir) return;
    if (!target.children) {
      target.children = await loadDir(path);
      set({ tree: { ...tree } });
    }
  },

  async createFileInDir(dir: string, name: string, content = "") {
    const path = dir.replace(/\/$/, "") + "/" + name;
    await fs.create(path, content);
    await get().refreshTree();
    return path;
  },

  async createDir(parent: string, name: string) {
    const path = parent.replace(/\/$/, "") + "/" + name + "/.gitkeep";
    await fs.create(path, "");
    await get().refreshTree();
  },

  async renameEntry(oldPath: string, newName: string) {
    const parent = oldPath.slice(0, oldPath.lastIndexOf("/"));
    const newPath = parent + "/" + newName;
    await fs.rename(oldPath, newPath);
    await get().refreshTree();
    return newPath;
  },

  async deleteEntry(path: string) {
    await fs.remove(path);
    await get().refreshTree();
  },
}));
