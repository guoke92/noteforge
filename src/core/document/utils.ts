/** Lightweight revision token for conflict detection (Phase 0). */
export function buildDiskRevision(content: string, modified?: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 31 + content.charCodeAt(i)) | 0;
  }
  return `${modified ?? "na"}:${content.length}:${hash}`;
}

export function newDocumentId(): string {
  return `doc-${Math.random().toString(36).slice(2, 11)}`;
}

export function basename(path: string): string {
  const normalized = path.replace(/\/$/, "");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}
