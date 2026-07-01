import { serializeBlockModel } from "../blocks/registry";
import { isUnknownBlock, type EditorDocument, type EditorSegment } from "../editor/schema";

function serializeSegment(segment: EditorSegment): string {
  if (segment.kind === "raw") return segment.raw;
  const { model } = segment.block;
  if (isUnknownBlock(model)) return model.raw;
  return serializeBlockModel(model);
}

/** L2: EditorDocument → Markdown string (pure). */
export function serializeMarkdown(doc: EditorDocument): string {
  return doc.segments.map(serializeSegment).join("");
}

/** Enumerate editable blocks for anchor mapping. */
export function listEditorBlocks(doc: EditorDocument): Array<{ id: string; index: number }> {
  const result: Array<{ id: string; index: number }> = [];
  let blockIndex = 0;
  for (const segment of doc.segments) {
    if (segment.kind === "block") {
      result.push({ id: segment.block.id, index: blockIndex });
      blockIndex++;
    }
  }
  return result;
}
