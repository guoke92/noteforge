import { fs } from "@/ipc";

function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

function resolvePathSegments(baseDir: string, relative: string): string {
  const baseParts = baseDir ? baseDir.split("/").filter(Boolean) : [];
  const rel = relative.replace(/\\/g, "/").replace(/^\.\//, "");
  const relParts = rel.split("/").filter((part) => part.length > 0);
  const stack = [...baseParts];
  for (const part of relParts) {
    if (part === "..") stack.pop();
    else if (part !== ".") stack.push(part);
  }
  return stack.join("/");
}

/** Resolve markdown image `src` to something renderable in the desktop app. */
export function resolveMarkdownImagePath(src: string, documentPath: string): string {
  const trimmed = src.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|data:|blob:|file:)/i.test(trimmed)) return trimmed;
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("/")) return trimmed;
  if (!documentPath) return trimmed;
  return resolvePathSegments(dirname(documentPath), trimmed);
}

export async function loadMarkdownImageSrc(
  src: string,
  documentPath: string,
): Promise<{ url: string; error?: string }> {
  const resolved = resolveMarkdownImagePath(src, documentPath);
  if (!resolved) return { url: "", error: "empty src" };
  if (/^(https?:|data:|blob:)/i.test(resolved)) return { url: resolved };

  try {
    const { dataUrl } = await fs.readImageDataUrl(resolved);
    return { url: dataUrl };
  } catch {
    return { url: resolved, error: "load failed" };
  }
}
