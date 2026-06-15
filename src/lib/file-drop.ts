import { fs } from "@/ipc";
import { ensureDocumentTabInPane } from "@/core/bridge/editor-sync";
import {
  getCore,
  openDocumentInPane,
  openVault,
  scheduleWorkspacePersist,
} from "@/core/runtime";
import { useEditorStore } from "@/store/editor";
import { basename, dirname, fileExt } from "@/lib/utils";

const BINARY_EXTENSIONS = new Set([
  "app",
  "dmg",
  "exe",
  "zip",
  "gz",
  "tar",
  "bz2",
  "7z",
  "rar",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "icns",
  "mp4",
  "mov",
  "mp3",
  "wav",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "bin",
  "dat",
]);

export function isOpenableFileName(name: string): boolean {
  const ext = fileExt(name);
  if (!ext) return true;
  return !BINARY_EXTENSIONS.has(ext);
}

function normalizePath(path: string): string {
  return path.replace(/\/+$/, "");
}

function isUnderVault(filePath: string, vaultRoot: string): boolean {
  const root = normalizePath(vaultRoot);
  const file = normalizePath(filePath);
  return file === root || file.startsWith(`${root}/`);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const info = await fs.info(path);
    return info.isDir;
  } catch {
    try {
      await fs.list(path);
      return true;
    } catch {
      return false;
    }
  }
}

export async function classifyDroppedPaths(
  paths: string[],
): Promise<{ directories: string[]; files: string[] }> {
  const directories: string[] = [];
  const files: string[] = [];
  const seen = new Set<string>();

  for (const raw of paths) {
    const path = raw.trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);

    if (await isDirectory(path)) {
      directories.push(path);
      continue;
    }

    if (isOpenableFileName(basename(path))) {
      files.push(path);
    }
  }

  return { directories, files };
}

async function ensureVaultForFile(filePath: string): Promise<void> {
  const vault = getCore().vault.getCurrent();
  if (vault && isUnderVault(filePath, vault.rootPath)) return;

  const parent = dirname(filePath);
  if (!parent || parent === "/") return;

  try {
    await openVault(parent);
  } catch (err) {
    // Parent folder may be outside registered workspaces; still open the file.
    console.warn("Could not open parent vault for dropped file", parent, err);
  }
}

export async function openDroppedPaths(paths: string[]): Promise<void> {
  const normalized = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
  if (normalized.length === 0) return;

  const { directories, files } = await classifyDroppedPaths(normalized);
  const paneId = useEditorStore.getState().activePaneId;

  if (directories.length === 0 && files.length === 0) {
    throw new Error("没有可打开的文件或文件夹");
  }

  if (directories.length > 0) {
    await openVault(directories[0]!);
  }

  for (const filePath of files) {
    await ensureVaultForFile(filePath);
    await openDocumentInPane(filePath, paneId);
  }

  scheduleWorkspacePersist();
}

/** Browser fallback when OS paths are unavailable (dev / web). */
export async function openDroppedFileBlobs(files: File[]): Promise<void> {
  const paneId = useEditorStore.getState().activePaneId;
  let opened = 0;

  for (const file of files) {
    if (!isOpenableFileName(file.name)) continue;

    const content = await file.text();
    const title = basename(file.name).replace(/\.[^.]+$/, "") || file.name;
    const doc = getCore().document.createEphemeral({
      paneId,
      title,
      content,
      initialMode: "write",
    });
    ensureDocumentTabInPane(doc, paneId);
    opened += 1;
  }

  if (opened === 0) {
    throw new Error("没有可打开的文件");
  }

  scheduleWorkspacePersist();
}

export function dragEventHasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

export async function handleBrowserFileDrop(event: DragEvent): Promise<void> {
  event.preventDefault();
  event.stopPropagation();

  const items = event.dataTransfer?.items;
  if (items && items.length > 0) {
    const paths: string[] = [];
    for (const item of items) {
      const file = item.getAsFile();
      if (file) {
        const path = (file as File & { path?: string }).path;
        if (path) paths.push(path);
      }
    }
    if (paths.length > 0) {
      await openDroppedPaths(paths);
      return;
    }
  }

  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) return;
  await openDroppedFileBlobs(files);
}
