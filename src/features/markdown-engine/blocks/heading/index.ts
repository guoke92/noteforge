import type { HeadingModel } from "../types";
import { cloneInlineModel, inlineModelsEqual, parseInlineMarkdown, serializeInlineMarkdown } from "../inline";

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

export function parseHeadingBlock(raw: string): HeadingModel {
  const line = raw.replace(/\n$/, "");
  const match = HEADING_RE.exec(line);
  if (!match) {
    return {
      type: "heading",
      level: 1,
      content: parseInlineMarkdown(line),
    };
  }
  const level = Math.min(6, Math.max(1, match[1]!.length)) as HeadingModel["level"];
  return {
    type: "heading",
    level,
    content: parseInlineMarkdown(match[2]!),
  };
}

export function serializeHeadingBlock(model: HeadingModel): string {
  const prefix = "#".repeat(model.level);
  const body = serializeInlineMarkdown(model.content);
  return `${prefix} ${body}\n`;
}

export function headingModelsEqual(a: HeadingModel, b: HeadingModel): boolean {
  return a.level === b.level && inlineModelsEqual(a.content, b.content);
}

export function cloneHeadingModel(model: HeadingModel): HeadingModel {
  return {
    type: "heading",
    level: model.level,
    content: cloneInlineModel(model.content),
  };
}
