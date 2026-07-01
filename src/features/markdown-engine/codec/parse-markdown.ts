import { detectBlockType, parseBlockModel } from "../blocks/registry";
import type { BlockType } from "../blocks/types";
import type { EditorBlock, EditorDocument, EditorSegment } from "../editor/schema";
import { parseSourceDocument } from "../source/parser";
import type { BlockChunk, SourceChunk } from "../source/types";
import { newBlockId } from "../source/hash";

function chunkToSegment(chunk: SourceChunk): EditorSegment {
  if (chunk.kind === "space" || chunk.kind === "raw") {
    return { kind: "raw", raw: chunk.raw };
  }
  return { kind: "block", block: sourceBlockToEditorBlock(chunk) };
}

function sourceBlockToEditorBlock(chunk: BlockChunk): EditorBlock {
  return {
    id: chunk.id,
    model: chunk.model,
  };
}

function tryParseUnknown(raw: string): EditorBlock {
  const blockType = detectBlockType(raw);
  if (!blockType) {
    return { id: newBlockId(), model: { type: "unknown", raw } };
  }
  try {
    const model = parseBlockModel(blockType as BlockType, raw);
    return { id: newBlockId(), model };
  } catch {
    return { id: newBlockId(), model: { type: "unknown", raw } };
  }
}

/** L2: Markdown string → EditorDocument (pure, no side effects). */
export function parseMarkdown(text: string): EditorDocument {
  const source = parseSourceDocument(text);
  const segments = source.chunks.map(chunkToSegment);
  return { version: source.version, segments };
}

/** Re-parse a single raw segment when user edits unknown/frontmatter in source mode. */
export function parseRawSegment(raw: string): EditorSegment {
  if (raw.trim().length === 0) {
    return { kind: "block", block: { id: newBlockId(), model: { type: "paragraph", content: { nodes: [{ type: "text", text: "" }] } } } };
  }
  const blockType = detectBlockType(raw);
  if (!blockType) {
    return { kind: "raw", raw };
  }
  return { kind: "block", block: tryParseUnknown(raw) };
}
