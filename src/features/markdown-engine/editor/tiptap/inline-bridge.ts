import type { InlineModel, InlineNode } from "../../blocks/types";
import type { JSONContent } from "@tiptap/react";

function inlineNodeToJson(node: InlineNode): JSONContent | null {
  switch (node.type) {
    case "text":
      return node.text.length > 0 ? { type: "text", text: node.text } : null;
    case "strong": {
      const text = node.children.map((c) => (c.type === "text" ? c.text : "")).join("");
      return text.length > 0
        ? { type: "text", text, marks: [{ type: "bold" }] }
        : null;
    }
    case "em": {
      const text = node.children.map((c) => (c.type === "text" ? c.text : "")).join("");
      return text.length > 0
        ? { type: "text", text, marks: [{ type: "italic" }] }
        : null;
    }
    case "code":
      return node.text.length > 0
        ? { type: "text", text: node.text, marks: [{ type: "code" }] }
        : null;
    case "link": {
      const text = node.children.map((c) => (c.type === "text" ? c.text : "")).join("");
      return text.length > 0
        ? {
            type: "text",
            text,
            marks: [{ type: "link", attrs: { href: node.href } }],
          }
        : null;
    }
    default:
      return null;
  }
}

/** ProseMirror rejects `{ type: "text", text: "" }` — omit inline content when empty. */
export function inlineModelToJson(model: InlineModel): JSONContent[] | undefined {
  const nodes = model.nodes.flatMap((n) => {
    const json = inlineNodeToJson(n);
    return json ? [json] : [];
  });
  return nodes.length > 0 ? nodes : undefined;
}

export function jsonToInlineModel(content: JSONContent[] | undefined): InlineModel {
  const nodes: InlineNode[] = [];
  for (const child of content ?? []) {
    if (child.type !== "text" || !child.text) continue;
    const marks = child.marks ?? [];
    if (marks.some((m) => m.type === "bold")) {
      nodes.push({ type: "strong", children: [{ type: "text", text: child.text }] });
    } else if (marks.some((m) => m.type === "italic")) {
      nodes.push({ type: "em", children: [{ type: "text", text: child.text }] });
    } else if (marks.some((m) => m.type === "code")) {
      nodes.push({ type: "code", text: child.text });
    } else if (marks.some((m) => m.type === "link")) {
      const href = marks.find((m) => m.type === "link")?.attrs?.href as string;
      nodes.push({ type: "link", href: href ?? "", children: [{ type: "text", text: child.text }] });
    } else {
      nodes.push({ type: "text", text: child.text });
    }
  }
  if (nodes.length === 0) nodes.push({ type: "text", text: "" });
  return { nodes };
}
