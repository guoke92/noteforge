const FRONT_MATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

/** 1-based line number where markdown body starts (after front matter). */
export function markdownBodyStartLine(content: string): number {
  const match = content.match(FRONT_MATTER_RE);
  if (!match) return 1;
  return match[0].split("\n").length + 1;
}

export function stripFrontMatter(content: string): { body: string; raw: string } {
  const match = content.match(FRONT_MATTER_RE);
  if (!match) return { body: content, raw: "" };
  return { body: content.slice(match[0].length), raw: match[1] };
}
