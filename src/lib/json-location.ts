export type JsonPath = string[];

function unescapeJsonKey(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

function lineIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

/** Map each JSON property key line to its path (pretty-printed / indented JSON). */
export function buildJsonKeyLineIndex(content: string): { line: number; path: JsonPath }[] {
  const lines = content.split("\n");
  const stack: { indent: number; key: string }[] = [];
  const entries: { line: number; path: JsonPath }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = lineIndent(line);
    const m = line.trimStart().match(/^"((?:\\.|[^"\\])*)"\s*:/);
    if (!m) continue;

    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop();
    }
    const key = unescapeJsonKey(m[1]);
    stack.push({ indent, key });
    entries.push({ line: i + 1, path: stack.map((s) => s.key) });
  }

  return entries;
}

/** Innermost property path whose definition line is on or before `line` (1-based). */
export function findJsonPathAtLine(content: string, line: number): JsonPath {
  const index = buildJsonKeyLineIndex(content);
  if (index.length === 0) return [];

  for (let i = 0; i < index.length; i++) {
    const entry = index[i]!;
    const nextLine = index[i + 1]?.line ?? Number.POSITIVE_INFINITY;
    if (entry.line <= line && line < nextLine) {
      return entry.path;
    }
  }

  let path: JsonPath = [];
  for (const entry of index) {
    if (entry.line <= line) path = entry.path;
    else break;
  }
  return path;
}

export function findLineForJsonPath(content: string, path: JsonPath): number | null {
  if (path.length === 0) return 1;
  const index = buildJsonKeyLineIndex(content);
  const exact = index.find((e) => pathsEqual(e.path, path));
  return exact?.line ?? null;
}

export function pathsEqual(a: JsonPath, b: JsonPath): boolean {
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === b[i]);
}

export function isAncestorPath(prefix: JsonPath, full: JsonPath): boolean {
  if (prefix.length >= full.length) return false;
  return prefix.every((seg, i) => seg === full[i]);
}
