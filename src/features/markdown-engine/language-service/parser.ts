import { parseFrontMatter } from "@/lib/front-matter";
import type { MarkdownDoc, OutlineNode, WikiLinkRef } from "./types";

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function parseOutline(body: string, bodyStartLine: number): OutlineNode[] {
  const outline: OutlineNode[] = [];
  body.split("\n").forEach((line, idx) => {
    const m = line.match(HEADING_RE);
    if (m) {
      outline.push({
        level: m[1]!.length,
        text: m[2]!.trim(),
        line: bodyStartLine + idx,
      });
    }
  });
  return outline;
}

function parseWikiLinks(content: string): WikiLinkRef[] {
  const links: WikiLinkRef[] = [];
  const lines = content.split("\n");
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    WIKI_LINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKI_LINK_RE.exec(line))) {
      links.push({
        label: match[1]!.trim(),
        line: lineIdx + 1,
        column: match.index + 1,
      });
    }
  }
  return links;
}

function bodyStartLine(content: string): number {
  if (!content.startsWith("---\n")) return 1;
  const end = content.indexOf("\n---", 4);
  if (end < 0) return 1;
  return content.slice(0, end + 4).split("\n").length + 1;
}

/** Parse markdown into a structured doc snapshot (P0: line/regex; P1+: remark AST). */
export function parseMarkdownDocument(content: string): MarkdownDoc {
  const { meta, body } = parseFrontMatter(content);
  const startLine = bodyStartLine(content);
  return {
    content,
    frontMatter: meta,
    body,
    outline: parseOutline(body, startLine),
    wikiLinks: parseWikiLinks(content),
  };
}
