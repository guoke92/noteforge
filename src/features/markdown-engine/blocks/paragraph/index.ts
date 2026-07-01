import type { ParagraphModel } from "../types";
import { cloneInlineModel, inlineModelsEqual, parseInlineMarkdown, serializeInlineMarkdown } from "../inline";

export function parseParagraphBlock(raw: string): ParagraphModel {
  const text = raw.replace(/\n$/, "");
  return {
    type: "paragraph",
    content: parseInlineMarkdown(text),
  };
}

export function serializeParagraphBlock(model: ParagraphModel): string {
  return `${serializeInlineMarkdown(model.content)}\n`;
}

export function paragraphModelsEqual(a: ParagraphModel, b: ParagraphModel): boolean {
  return inlineModelsEqual(a.content, b.content);
}

export function cloneParagraphModel(model: ParagraphModel): ParagraphModel {
  return {
    type: "paragraph",
    content: cloneInlineModel(model.content),
  };
}
