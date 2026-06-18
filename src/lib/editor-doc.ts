import type { EditorTab } from "@/store/editor";
import { basename, detectLanguageFromName, fileExt } from "@/lib/utils";
import { defaultExtensionForLanguage as extForLanguage } from "@/lib/language-registry";

export function isScratchTab(tab: EditorTab): boolean {
  return tab.kind === "scratch";
}

export function tabLabel(tab: EditorTab): string {
  return tab.displayName;
}

const UNTITLED_RE = /^Untitled-(\d+)$/i;

function untitledNumber(name: string): number | null {
  const m = name.match(UNTITLED_RE);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

/** Highest Untitled-N index among scratch tabs (0 if none). */
function maxUntitledNumber(tabs: EditorTab[]): number {
  let max = 0;
  for (const t of tabs) {
    if (t.kind !== "scratch") continue;
    const n = untitledNumber(t.displayName);
    if (n !== null && n > max) max = n;
  }
  return max;
}

/** Next Untitled-N for a brand-new scratch tab (monotonic, never reuses lower gaps). */
export function nextUntitledDisplayName(tabs: EditorTab[]): string {
  return `Untitled-${maxUntitledNumber(tabs) + 1}`;
}

/**
 * Preserve persisted scratch names on restore. Only assigns a new Untitled-N when
 * the name is missing or duplicated in the session (corrupted legacy data).
 */
export function normalizeScratchDisplayNames(scratchTabs: EditorTab[]): EditorTab[] {
  const used = new Set<string>();
  let maxNum = maxUntitledNumber(scratchTabs);
  const result: EditorTab[] = [];

  for (const t of scratchTabs) {
    let name = t.displayName.trim();
    if (!name) {
      maxNum += 1;
      name = `Untitled-${maxNum}`;
    } else if (used.has(name.toLowerCase())) {
      maxNum += 1;
      name = `Untitled-${maxNum}`;
    } else {
      const n = untitledNumber(name);
      if (n !== null && n > maxNum) maxNum = n;
    }
    used.add(name.toLowerCase());
    result.push({ ...t, displayName: name });
  }
  return result;
}

export function defaultExtensionForLanguage(language: string): string {
  return extForLanguage(language);
}

/**
 * Infer format from buffer content only. Returns null → caller should use .txt.
 * Does not use the tab's syntax-highlighter language.
 */
export function detectLanguageFromContent(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      /* not json */
    }
  }

  if (/^<\?xml\s/i.test(trimmed)) return "xml";

  if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return "html";
  }

  if (
    /^---\s*$/m.test(trimmed) &&
    /^[a-zA-Z0-9_-]+:\s*.+$/m.test(trimmed) &&
    !/^#{1,6}\s/m.test(trimmed)
  ) {
    return "yaml";
  }

  if (
    /^#{1,6}\s/m.test(trimmed) ||
    /\[\[[^\]]+\]\]/.test(trimmed) ||
    /^[-*+]\s+\S/m.test(trimmed) ||
    /```[\s\S]*?```/.test(trimmed) ||
    (trimmed.startsWith("---") && /^#{1,6}\s/m.test(trimmed))
  ) {
    return "markdown";
  }

  if (/^\s*SELECT\s+/im.test(trimmed) || /^\s*INSERT\s+INTO\s+/im.test(trimmed)) {
    return "sql";
  }

  if (/^\s*fn\s+\w+/m.test(trimmed) || /^\s*pub\s+fn\s+/m.test(trimmed) || /\bimpl\s+/.test(trimmed)) {
    return "rust";
  }

  if (/^\s*def\s+\w+/m.test(trimmed) || /^\s*class\s+\w+/m.test(trimmed)) {
    return "python";
  }

  if (
    /^\s*(function|const|let|var)\s+\w+/m.test(trimmed) ||
    /^\s*import\s+.+\s+from\s+['"]/m.test(trimmed) ||
    /=>\s*{/.test(trimmed)
  ) {
    return "javascript";
  }

  if (/^\s*package\s+\w+/m.test(trimmed) || /^\s*func\s+\w+/m.test(trimmed)) {
    return "go";
  }

  if (/^\[.+\]\s*$/m.test(trimmed) && /^[a-zA-Z0-9_-]+\s*=/m.test(trimmed)) {
    return "toml";
  }

  if (/^\s*\/\*|^\s*\/\/|^[.#][\w-]+\s*\{/m.test(trimmed)) {
    return "css";
  }

  if (/^<\w+[^>]*>[\s\S]*<\/\w+>/m.test(trimmed) && !trimmed.startsWith("<!DOCTYPE")) {
    return "xml";
  }

  return null;
}

/** Extension for Save As: strictly from content; unknown → txt. */
export function extensionForSave(content: string): string {
  const fromContent = detectLanguageFromContent(content);
  if (fromContent) return defaultExtensionForLanguage(fromContent);
  return "txt";
}

/** Language label for tab badge / highlighter: language-first, then path, else plain text. */
export function tabDisplayLanguage(
  tab: Pick<EditorTab, "kind" | "path" | "language">,
): string {
  if (tab.language && tab.language !== "plaintext") return tab.language;
  if (tab.kind === "workspace" && tab.path) {
    return detectLanguageFromName(basename(tab.path));
  }
  return "plaintext";
}

/** Markdown preview/edit modes apply only when language (or .md path) is markdown. */
export function isMarkdownTab(tab: Pick<EditorTab, "kind" | "path" | "language">): boolean {
  if (tab.language === "markdown") return true;
  if (tab.language && tab.language !== "plaintext") return false;
  if (tab.kind === "workspace" && tab.path) {
    const ext = fileExt(basename(tab.path));
    return ext === "md" || ext === "markdown";
  }
  return false;
}

export function suggestedSaveFileName(tab: EditorTab, content: string): string {
  const ext = extensionForSave(content);
  const base = tab.displayName.replace(/\.[^./]+$/, "") || tab.displayName;
  if (UNTITLED_RE.test(base) || !tab.displayName.includes(".")) {
    return `${base}.${ext}`;
  }
  return tab.displayName;
}

export function joinWorkspacePath(dir: string, fileName: string): string {
  const clean = dir.replace(/\/$/, "");
  const name = fileName.replace(/^\//, "");
  return `${clean}/${name}`;
}
