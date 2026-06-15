import type { JsonPath } from "@/lib/json-location";

function lineIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

/** Map YAML key lines to dot-separated paths (indented YAML). */
export function buildYamlKeyLineIndex(content: string): { line: number; path: JsonPath }[] {
  const lines = content.split("\n");
  const stack: { indent: number; key: string }[] = [];
  const entries: { line: number; path: JsonPath }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = lineIndent(line);
    const m = trimmed.match(/^(["']?)([\w.-]+)\1\s*:/);
    if (!m) continue;

    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop();
    }
    stack.push({ indent, key: m[2] });
    entries.push({ line: i + 1, path: stack.map((s) => s.key) });
  }

  return entries;
}

export function findYamlPathAtLine(content: string, line: number): JsonPath {
  const index = buildYamlKeyLineIndex(content);
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

export function findLineForYamlPath(content: string, path: JsonPath): number | null {
  if (path.length === 0) return 1;
  const index = buildYamlKeyLineIndex(content);
  const exact = index.find((e) => e.path.join("\0") === path.join("\0"));
  return exact?.line ?? null;
}
