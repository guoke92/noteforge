import type { EditorDocument, ModeSwitchAnchor } from "../editor/schema";
import { serializeMarkdown } from "./serialize-markdown";
import { isUnknownBlock } from "../editor/schema";

export type TextPosition = { line: number; column: number; charOffset: number };

function segmentCharLength(segment: EditorDocument["segments"][number]): number {
  if (segment.kind === "raw") return segment.raw.length;
  if (isUnknownBlock(segment.block.model)) return segment.block.model.raw.length;
  return serializeMarkdown({ version: 1, segments: [segment] }).length;
}

/** Map block id + in-block offset → markdown text position (1-based line). */
export function locateAnchorInMarkdown(
  text: string,
  anchor: ModeSwitchAnchor,
): TextPosition {
  const lines = text.split("\n");
  let charOffset = 0;
  let found = false;

  const doc: EditorDocument = { version: 1, segments: [] };
  // Walk serialized blocks in order by re-parsing text is expensive; use line scan with block markers.
  // Fallback: scroll ratio + char offset from block id search in text.
  const blockMarker = `data-block-id="${anchor.blockId}"`;
  const htmlIdx = text.indexOf(blockMarker);
  if (htmlIdx >= 0) {
    charOffset = htmlIdx;
    found = true;
  }

  if (!found) {
    // Serialize each block from doc not available here — scan by block order in full doc parse
    void doc;
    const blocks = text.split(/(?=^#{1,6}\s)|(?=^```)|(?=^\|)/m);
    let running = 0;
    for (const part of blocks) {
      running += part.length;
      if (running > anchor.offsetInBlock) {
        charOffset = running - part.length + Math.min(anchor.offsetInBlock, part.length);
        found = true;
        break;
      }
    }
    if (!found) charOffset = Math.min(anchor.offsetInBlock, text.length);
  }

  let line = 1;
  let column = 1;
  let pos = 0;
  for (let i = 0; i < text.length && pos < charOffset; i++) {
    if (text[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
    pos++;
  }

  if (anchor.scrollRatio !== undefined && line === 1 && column === 1) {
    const targetLine = Math.max(1, Math.round(anchor.scrollRatio * lines.length));
    return { line: targetLine, column: 1, charOffset: lineStartOffset(text, targetLine) };
  }

  return { line, column, charOffset };
}

function lineStartOffset(text: string, line: number): number {
  if (line <= 1) return 0;
  let current = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      current++;
      if (current === line) return i + 1;
    }
  }
  return text.length;
}

/** Map markdown char offset → block anchor (best effort). */
export function locateAnchorInDocument(
  doc: EditorDocument,
  textPos: number,
): ModeSwitchAnchor {
  let offset = 0;
  for (const segment of doc.segments) {
    const len = segmentCharLength(segment);
    if (textPos <= offset + len) {
      if (segment.kind === "block") {
        return {
          blockId: segment.block.id,
          offsetInBlock: Math.max(0, textPos - offset),
        };
      }
      return { blockId: "__raw__", offsetInBlock: textPos - offset };
    }
    offset += len;
  }
  const lastBlock = [...doc.segments].reverse().find((s) => s.kind === "block");
  if (lastBlock?.kind === "block") {
    return { blockId: lastBlock.block.id, offsetInBlock: 0 };
  }
  return { blockId: "__start__", offsetInBlock: 0 };
}

export function lineToCharOffset(text: string, line: number, column = 1): number {
  const lines = text.split("\n");
  const idx = Math.max(0, Math.min(line - 1, lines.length - 1));
  let offset = 0;
  for (let i = 0; i < idx; i++) {
    offset += lines[i]!.length + 1;
  }
  return offset + Math.max(0, column - 1);
}
