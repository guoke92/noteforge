import { convertFileSrc } from "@tauri-apps/api/core";
import { dirname } from "@/lib/utils";
import { fs, isTauri } from "@/ipc";

export function toAbsoluteAssetPath(
  noteVaultPath: string | null,
  src: string,
): string | null {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|blob:|asset:)/i.test(trimmed)) return null;
  if (trimmed.startsWith("/")) return trimmed;
  if (!noteVaultPath) return null;

  const baseDir = dirname(noteVaultPath);
  const relative = trimmed.replace(/^\.\//, "");
  return `${baseDir}/${relative}`.replace(/\/+/g, "/");
}

/** Resolve `![alt](./assets/x.jpg)` src relative to the note path. */
export function resolveMarkdownAssetUrl(
  noteVaultPath: string | null,
  src: string,
): string {
  const trimmed = src.trim();
  if (!trimmed) return "";
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  if (/^asset:/i.test(trimmed)) return trimmed;

  const absolute = toAbsoluteAssetPath(noteVaultPath, trimmed);
  if (!absolute) return trimmed;

  if (isTauri()) {
    return convertFileSrc(absolute);
  }
  return absolute;
}

/** Load local image bytes as data URL (reliable in Tauri webview). */
export async function loadLocalImageDataUrl(
  absolutePath: string,
): Promise<string | null> {
  if (!isTauri() || !absolutePath) return null;
  try {
    const res = await fs.readImageDataUrl(absolutePath);
    return res.dataUrl;
  } catch {
    return null;
  }
}

export async function resolveMarkdownAssetUrlAsync(
  noteVaultPath: string | null,
  src: string,
): Promise<string> {
  const trimmed = src.trim();
  if (!trimmed) return "";
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;

  const absolute = toAbsoluteAssetPath(noteVaultPath, trimmed);
  if (!absolute) return trimmed;

  const dataUrl = await loadLocalImageDataUrl(absolute);
  if (dataUrl) return dataUrl;

  if (isTauri()) {
    return convertFileSrc(absolute);
  }
  return absolute;
}
