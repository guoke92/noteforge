import { dirname } from "@/lib/utils";

/** Resolve `[text](./note.md)` href relative to the open note. */
export function resolveMarkdownLinkPath(
  noteVaultPath: string | null,
  href: string,
): string {
  const trimmed = href.trim();
  if (!trimmed || /^(https?:|mailto:|#)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  if (!noteVaultPath) return trimmed;

  const baseDir = dirname(noteVaultPath);
  const relative = trimmed.replace(/^\.\//, "");
  return `${baseDir}/${relative}`.replace(/\/+/g, "/");
}
