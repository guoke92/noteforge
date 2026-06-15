import type { FileEntry } from "@/types";
import { noteName } from "@/lib/utils";

export interface WikiNoteRef {
  path: string;
  title: string;
}

/** Collect markdown notes from workspace tree (ADR-008: path identity, title = basename). */
export function collectMarkdownNotes(tree: FileEntry | null): WikiNoteRef[] {
  const out: WikiNoteRef[] = [];
  function walk(entry: FileEntry | undefined) {
    if (!entry) return;
    if (!entry.isDir && entry.name.endsWith(".md")) {
      out.push({ path: entry.path, title: noteName(entry.path) });
    }
    entry.children?.forEach(walk);
  }
  walk(tree ?? undefined);
  return out;
}

export function resolveWikiTargetName(
  targetName: string,
  notes: WikiNoteRef[],
): { path: string | null; exists: boolean } {
  const exact = notes.find((n) => n.title === targetName);
  if (exact) return { path: exact.path, exists: true };

  const lower = targetName.toLowerCase();
  const ci = notes.find((n) => n.title.toLowerCase() === lower);
  if (ci) return { path: ci.path, exists: true };

  return { path: null, exists: false };
}

export function searchWikiTitles(
  query: string,
  notes: WikiNoteRef[],
  limit = 20,
): Array<{ path: string; title: string; score: number }> {
  const q = query.trim().toLowerCase();
  if (!q) {
    return notes.slice(0, limit).map((n) => ({ path: n.path, title: n.title, score: 1 }));
  }
  return notes
    .map((n) => {
      const title = n.title.toLowerCase();
      let score = 0;
      if (title === q) score = 100;
      else if (title.startsWith(q)) score = 80;
      else if (title.includes(q)) score = 50;
      return { path: n.path, title: n.title, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function resolvedWikiTargetNames(notes: WikiNoteRef[]): Set<string> {
  return new Set(notes.map((n) => n.title));
}
