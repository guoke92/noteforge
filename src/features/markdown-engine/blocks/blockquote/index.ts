import type { BlockquoteModel } from "../types";

export function parseBlockquoteBlock(raw: string): BlockquoteModel {
  const content = raw
    .split("\n")
    .filter((line, idx, arr) => idx < arr.length - 1 || line.length > 0)
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n");

  return {
    type: "blockquote",
    content,
  };
}

export function serializeBlockquoteBlock(model: BlockquoteModel): string {
  const lines = model.content.replace(/\n*$/, "").split("\n");
  return `${lines.map((line) => `> ${line}`).join("\n")}\n`;
}

export function blockquoteModelsEqual(a: BlockquoteModel, b: BlockquoteModel): boolean {
  return a.content === b.content;
}

export function cloneBlockquoteModel(model: BlockquoteModel): BlockquoteModel {
  return { ...model };
}

export function isBlockquoteBlockRaw(raw: string): boolean {
  return /^>\s?/.test(raw.split("\n")[0] ?? "");
}
