import type { ListItemModel, ListModel } from "../types";
import {
  cloneInlineModel,
  inlineModelsEqual,
  parseInlineMarkdown,
  serializeInlineMarkdown,
} from "../inline";

const LIST_ITEM_RE = /^(\s*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?(.*)$/;

export function listItemOrderedNumber(model: ListModel, index: number): number {
  const target = model.items[index];
  if (!target?.ordered) return 1;
  let stored = 0;
  for (let i = 0; i <= index; i += 1) {
    const item = model.items[i];
    if (!item || item.indent !== target.indent) continue;
    const nextNumber = stored + 1;
    if (item.ordered) {
      stored = nextNumber;
      if (i === index) return nextNumber;
    }
  }
  return stored || 1;
}

export function listItemDisplayMarker(model: ListModel, index: number): string {
  const item = model.items[index];
  if (!item) return "•";
  if (item.checked !== null) return "";
  return item.ordered ? `${listItemOrderedNumber(model, index)}.` : "•";
}

export function parseListBlock(raw: string): ListModel {
  const lines = raw
    .split("\n")
    .filter((line, idx, arr) => idx < arr.length - 1 || line.length > 0);
  const items: ListItemModel[] = [];

  for (const line of lines) {
    const match = LIST_ITEM_RE.exec(line);
    if (!match) continue;

    const indent = Math.floor((match[1] ?? "").replace(/\t/g, "  ").length / 2);
    const marker = match[2] ?? "-";
    const task = match[3] ?? "";
    const checked = task ? /\[[xX]\]/.test(task) : null;

    items.push({
      indent,
      ordered: /\d+\./.test(marker),
      checked,
      content: parseInlineMarkdown(match[4] ?? ""),
    });
  }

  return { type: "list", items };
}

export function serializeListBlock(model: ListModel): string {
  const orderedCounters = new Map<number, number>();
  return `${model.items
    .map((item) => {
      const indent = "  ".repeat(item.indent);
      const nextNumber = (orderedCounters.get(item.indent) ?? 0) + 1;
      if (item.ordered) orderedCounters.set(item.indent, nextNumber);
      const marker = item.ordered ? `${nextNumber}.` : "-";
      const task = item.checked === null ? "" : item.checked ? "[x] " : "[ ] ";
      return `${indent}${marker} ${task}${serializeInlineMarkdown(item.content)}`;
    })
    .join("\n")}\n`;
}

export function listModelsEqual(a: ListModel, b: ListModel): boolean {
  if (a.items.length !== b.items.length) return false;
  return a.items.every((item, index) => {
    const other = b.items[index]!;
    return (
      item.indent === other.indent &&
      item.ordered === other.ordered &&
      item.checked === other.checked &&
      inlineModelsEqual(item.content, other.content)
    );
  });
}

export function cloneListModel(model: ListModel): ListModel {
  return {
    type: "list",
    items: model.items.map((item) => ({
      ...item,
      content: cloneInlineModel(item.content),
    })),
  };
}

export function updateListItemText(
  model: ListModel,
  index: number,
  text: string,
): ListModel {
  const next = cloneListModel(model);
  const item = next.items[index];
  if (!item) return next;
  item.content = parseInlineMarkdown(text);
  return next;
}

export function updateListItemIndent(
  model: ListModel,
  index: number,
  delta: number,
): ListModel {
  const next = cloneListModel(model);
  const item = next.items[index];
  if (!item) return next;
  item.indent = Math.max(0, item.indent + delta);
  return next;
}

export function insertListItemAfter(model: ListModel, index: number): ListModel {
  const next = cloneListModel(model);
  const current = next.items[index];
  const fallback: ListItemModel = {
    indent: 0,
    ordered: false,
    checked: null,
    content: parseInlineMarkdown(""),
  };
  const source = current ?? fallback;
  next.items.splice(index + 1, 0, {
    indent: source.indent,
    ordered: source.ordered,
    checked: source.checked === null ? null : false,
    content: parseInlineMarkdown(""),
  });
  return next;
}

export function deleteListItem(model: ListModel, index: number): ListModel {
  const next = cloneListModel(model);
  if (next.items.length <= 1 || index < 0 || index >= next.items.length) return next;
  next.items.splice(index, 1);
  return next;
}

export function toggleListItemChecked(model: ListModel, index: number): ListModel {
  const next = cloneListModel(model);
  const item = next.items[index];
  if (!item || item.checked === null) return next;
  item.checked = !item.checked;
  return next;
}

export function isListBlockRaw(raw: string): boolean {
  const line = raw.split("\n")[0] ?? "";
  return LIST_ITEM_RE.test(line);
}
