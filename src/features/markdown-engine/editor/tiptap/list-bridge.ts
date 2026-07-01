import type { JSONContent } from "@tiptap/react";
import type { ListItemModel, ListModel } from "../../blocks/types";
import { inlineModelToJson, jsonToInlineModel } from "./inline-bridge";

function withInlineContent(inline: ReturnType<typeof inlineModelToJson>): Pick<JSONContent, "content"> {
  return inline ? { content: inline } : {};
}

type ListNodeType = "bulletList" | "orderedList" | "taskList";
type ListItemType = "listItem" | "taskItem";

function listNodeType(items: ListItemModel[]): ListNodeType {
  if (items.some((item) => item.checked !== null)) return "taskList";
  return items.some((item) => item.ordered) ? "orderedList" : "bulletList";
}

function listItemType(listType: ListNodeType): ListItemType {
  return listType === "taskList" ? "taskItem" : "listItem";
}

function buildNestedListItems(
  items: ListItemModel[],
  start: number,
  listType: ListNodeType,
): { nodes: JSONContent[]; next: number } {
  const nodes: JSONContent[] = [];
  let index = start;
  const baseIndent = items[index]?.indent ?? 0;
  const itemType = listItemType(listType);

  while (index < items.length && items[index]!.indent >= baseIndent) {
    const item = items[index]!;
    if (item.indent > baseIndent) {
      index += 1;
      continue;
    }

    const content: JSONContent[] = [
      {
        type: "paragraph",
        ...withInlineContent(inlineModelToJson(item.content)),
      },
    ];

    let next = index + 1;
    if (next < items.length && items[next]!.indent > baseIndent) {
      const nestedType = listNodeType(items.slice(next));
      const nested = buildNestedListItems(items, next, nestedType);
      content.push({ type: nestedType, content: nested.nodes });
      next = nested.next;
    }

    nodes.push({
      type: itemType,
      attrs: listType === "taskList" ? { checked: item.checked ?? false } : undefined,
      content,
    });
    index = next;
  }

  return { nodes, next: index };
}

export function listModelToTiptapJson(model: ListModel, attrs: Record<string, unknown>): JSONContent {
  const listType = listNodeType(model.items);
  const { nodes } = buildNestedListItems(model.items, 0, listType);
  return { type: listType, attrs, content: nodes };
}

function flattenListNode(node: JSONContent, indent: number): ListItemModel[] {
  const ordered = node.type === "orderedList";
  const items: ListItemModel[] = [];

  for (const item of node.content ?? []) {
    if (item.type !== "listItem" && item.type !== "taskItem") continue;

    const paragraph = item.content?.find((child) => child.type === "paragraph");
    const nested = item.content?.find(
      (child) =>
        child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList",
    );

    items.push({
      indent,
      ordered,
      checked: item.type === "taskItem" ? (item.attrs?.checked as boolean) ?? false : null,
      content: jsonToInlineModel(paragraph?.content),
    });

    if (nested) {
      items.push(...flattenListNode(nested, indent + 1));
    }
  }

  return items;
}

export function tiptapListToModel(node: JSONContent): ListModel {
  return { type: "list", items: flattenListNode(node, 0) };
}
