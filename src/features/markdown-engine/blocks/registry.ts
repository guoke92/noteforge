import type { BlockModel, BlockType } from "./types";
import {
  cloneHeadingModel,
  headingModelsEqual,
  parseHeadingBlock,
  serializeHeadingBlock,
} from "./heading";
import {
  cloneParagraphModel,
  paragraphModelsEqual,
  parseParagraphBlock,
  serializeParagraphBlock,
} from "./paragraph";
import {
  cloneTableModel,
  isTableBlockRaw,
  parseTableBlock,
  serializeTableBlock,
  tableModelsEqual,
} from "./table";
import {
  cloneListModel,
  isListBlockRaw,
  listModelsEqual,
  parseListBlock,
  serializeListBlock,
} from "./list";
import {
  cloneCodeModel,
  codeModelsEqual,
  isCodeBlockRaw,
  parseCodeBlock,
  serializeCodeBlock,
} from "./code";
import {
  cloneImageModel,
  imageModelsEqual,
  isImageBlockRaw,
  parseImageBlock,
  serializeImageBlock,
} from "./image";
import {
  blockquoteModelsEqual,
  cloneBlockquoteModel,
  isBlockquoteBlockRaw,
  parseBlockquoteBlock,
  serializeBlockquoteBlock,
} from "./blockquote";
import {
  cloneHrModel,
  hrModelsEqual,
  isHrBlockRaw,
  parseHrBlock,
  serializeHrBlock,
} from "./hr";

export function parseBlockModel(blockType: BlockType, raw: string): BlockModel {
  switch (blockType) {
    case "heading":
      return parseHeadingBlock(raw);
    case "paragraph":
      return parseParagraphBlock(raw);
    case "table":
      return parseTableBlock(raw);
    case "list":
      return parseListBlock(raw);
    case "code":
      return parseCodeBlock(raw);
    case "image":
      return parseImageBlock(raw);
    case "blockquote":
      return parseBlockquoteBlock(raw);
    case "hr":
      return parseHrBlock();
    default:
      return parseParagraphBlock(raw);
  }
}

export function serializeBlockModel(model: BlockModel): string {
  switch (model.type) {
    case "heading":
      return serializeHeadingBlock(model);
    case "paragraph":
      return serializeParagraphBlock(model);
    case "table":
      return serializeTableBlock(model);
    case "list":
      return serializeListBlock(model);
    case "code":
      return serializeCodeBlock(model);
    case "image":
      return serializeImageBlock(model);
    case "blockquote":
      return serializeBlockquoteBlock(model);
    case "hr":
      return serializeHrBlock();
    default:
      return "\n";
  }
}

export function cloneBlockModel(model: BlockModel): BlockModel {
  switch (model.type) {
    case "heading":
      return cloneHeadingModel(model);
    case "paragraph":
      return cloneParagraphModel(model);
    case "table":
      return cloneTableModel(model);
    case "list":
      return cloneListModel(model);
    case "code":
      return cloneCodeModel(model);
    case "image":
      return cloneImageModel(model);
    case "blockquote":
      return cloneBlockquoteModel(model);
    case "hr":
      return cloneHrModel(model);
    default:
      return cloneParagraphModel(model as never);
  }
}

export function blockModelsEqual(a: BlockModel, b: BlockModel): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "heading":
      return headingModelsEqual(a, b as typeof a);
    case "paragraph":
      return paragraphModelsEqual(a, b as typeof a);
    case "table":
      return tableModelsEqual(a, b as typeof a);
    case "list":
      return listModelsEqual(a, b as typeof a);
    case "code":
      return codeModelsEqual(a, b as typeof a);
    case "image":
      return imageModelsEqual(a, b as typeof a);
    case "blockquote":
      return blockquoteModelsEqual(a, b as typeof a);
    case "hr":
      return hrModelsEqual();
    default:
      return false;
  }
}

export function detectBlockType(raw: string): BlockType | null {
  const line = raw.split("\n")[0] ?? "";
  if (/^#{1,6}\s+/.test(line)) return "heading";
  if (isCodeBlockRaw(raw)) return "code";
  if (isBlockquoteBlockRaw(raw)) return "blockquote";
  if (isImageBlockRaw(raw)) return "image";
  if (isListBlockRaw(raw)) return "list";
  if (isTableBlockRaw(raw)) return "table";
  if (isHrBlockRaw(raw)) return "hr";
  if (line.trim().length > 0) return "paragraph";
  return null;
}
