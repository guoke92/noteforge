import { detectBlockType, parseBlockModel } from "../blocks/registry";
import { isTableBlockRaw } from "../blocks/table";
import type { BlockChunk, RawChunk, SourceChunk, SourceDocument } from "./types";
import { hashRaw, newBlockId } from "./hash";

const HEADING_LINE_RE = /^(#{1,6})\s+/;
const HR_LINE_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const IMAGE_LINE_RE = /^\s*!\[[^\]]*\]\([^)]+\)\s*$/;
const CODE_FENCE_RE = /^(`{3,}|~{3,})/;
const BLOCKQUOTE_RE = /^>\s?/;
const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+/;

type LineInfo = {
  text: string;
  raw: string;
};

function splitLines(markdown: string): LineInfo[] {
  if (markdown.length === 0) return [];

  const lines: LineInfo[] = [];
  let start = 0;
  for (let i = 0; i < markdown.length; i++) {
    if (markdown[i] !== "\n") continue;
    const raw = markdown.slice(start, i + 1);
    lines.push({ text: raw.replace(/\n$/, ""), raw });
    start = i + 1;
  }
  if (start < markdown.length) {
    const raw = markdown.slice(start);
    lines.push({ text: raw, raw });
  }
  return lines;
}

function createBlockChunk(raw: string): BlockChunk {
  const blockType = detectBlockType(raw) ?? "paragraph";
  const model = parseBlockModel(blockType, raw);
  return {
    kind: "block",
    id: newBlockId(),
    blockType,
    raw,
    model,
    baselineModel: parseBlockModel(blockType, raw),
    dirty: false,
    meta: {
      sourceHash: hashRaw(raw),
      version: 1,
    },
  };
}

function createRawChunk(raw: string, reason: RawChunk["reason"]): RawChunk {
  return { kind: "raw", raw, reason };
}

function extractFrontmatter(markdown: string): { chunk: RawChunk | null; body: string } {
  if (!markdown.startsWith("---\n")) {
    return { chunk: null, body: markdown };
  }
  const end = markdown.indexOf("\n---", 4);
  if (end < 0) return { chunk: null, body: markdown };

  let fmEnd = end + 4;
  if (markdown[fmEnd] === "\n") fmEnd += 1;
  const raw = markdown.slice(0, fmEnd);
  return {
    chunk: createRawChunk(raw, "frontmatter"),
    body: markdown.slice(fmEnd),
  };
}

function readCodeFence(lines: LineInfo[], start: number): { raw: string; next: number } {
  const first = lines[start]!;
  const fence = first.text.match(CODE_FENCE_RE)?.[1] ?? "```";
  const marker = fence[0]!;
  let i = start + 1;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.text.trim().startsWith(marker.repeat(fence.length))) {
      const raw = lines.slice(start, i + 1).map((l) => l.raw).join("");
      return { raw, next: i + 1 };
    }
    i++;
  }
  const raw = lines.slice(start).map((l) => l.raw).join("");
  return { raw, next: lines.length };
}

function readBlockquote(lines: LineInfo[], start: number): { raw: string; next: number } {
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.text.trim().length === 0) break;
    if (!BLOCKQUOTE_RE.test(line.text)) break;
    i++;
  }
  const raw = lines.slice(start, i).map((l) => l.raw).join("");
  return { raw, next: i };
}

function readList(lines: LineInfo[], start: number): { raw: string; next: number } {
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.text.trim().length === 0) break;
    if (!LIST_RE.test(line.text)) break;
    i++;
  }
  const raw = lines.slice(start, i).map((l) => l.raw).join("");
  return { raw, next: i };
}

function readTable(lines: LineInfo[], start: number): { raw: string; next: number } {
  let i = start + 2;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.text.trim().length === 0) break;
    if (!line.text.trim().startsWith("|")) break;
    if (/^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line.text.trim())) break;
    i++;
  }
  const raw = lines.slice(start, i).map((l) => l.raw).join("");
  return { raw, next: i };
}

function readParagraph(lines: LineInfo[], start: number): { raw: string; next: number } {
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.text.trim().length === 0) break;
    if (HEADING_LINE_RE.test(line.text)) break;
    if (CODE_FENCE_RE.test(line.text)) break;
    if (BLOCKQUOTE_RE.test(line.text)) break;
    if (LIST_RE.test(line.text)) break;
    if (HR_LINE_RE.test(line.text)) break;
    if (IMAGE_LINE_RE.test(line.text)) break;
    if (isTableBlockRaw(`${line.raw}${lines[i + 1]?.raw ?? ""}`)) break;
    i++;
  }
  const raw = lines.slice(start, i).map((l) => l.raw).join("");
  return { raw, next: i };
}

export function parseSourceDocument(markdown: string): SourceDocument {
  const chunks: SourceChunk[] = [];
  const { chunk: frontmatter, body } = extractFrontmatter(markdown);
  if (frontmatter) chunks.push(frontmatter);

  const lines = splitLines(body);
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex]!;

    if (line.text.trim().length === 0) {
      chunks.push(createBlockChunk(line.raw));
      lineIndex++;
      continue;
    }

    if (CODE_FENCE_RE.test(line.text)) {
      const block = readCodeFence(lines, lineIndex);
      chunks.push(createBlockChunk(block.raw));
      lineIndex = block.next;
      continue;
    }

    if (BLOCKQUOTE_RE.test(line.text)) {
      const block = readBlockquote(lines, lineIndex);
      chunks.push(createBlockChunk(block.raw));
      lineIndex = block.next;
      continue;
    }

    if (LIST_RE.test(line.text)) {
      const block = readList(lines, lineIndex);
      chunks.push(createBlockChunk(block.raw));
      lineIndex = block.next;
      continue;
    }

    if (HR_LINE_RE.test(line.text)) {
      chunks.push(createBlockChunk(line.raw));
      lineIndex++;
      continue;
    }

    if (IMAGE_LINE_RE.test(line.text)) {
      chunks.push(createBlockChunk(line.raw));
      lineIndex++;
      continue;
    }

    if (
      line.text.trim().startsWith("|") &&
      lines[lineIndex + 1] &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[lineIndex + 1]!.text.trim())
    ) {
      const block = readTable(lines, lineIndex);
      chunks.push(createBlockChunk(block.raw));
      lineIndex = block.next;
      continue;
    }

    if (HEADING_LINE_RE.test(line.text)) {
      chunks.push(createBlockChunk(line.raw));
      lineIndex++;
      continue;
    }

    const block = readParagraph(lines, lineIndex);
    if (block.raw.length > 0) {
      chunks.push(createBlockChunk(block.raw));
    }
    lineIndex = block.next;
  }

  return { version: 1, chunks };
}
