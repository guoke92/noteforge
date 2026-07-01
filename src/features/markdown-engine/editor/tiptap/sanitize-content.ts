import type { JSONContent } from "@tiptap/react";

/** Remove empty text nodes and empty inline arrays before passing to TipTap. */
export function sanitizeTiptapJson(doc: JSONContent): JSONContent {
  return sanitizeNode(doc) ?? { type: "doc", content: [{ type: "paragraph" }] };
}

function sanitizeNode(node: JSONContent): JSONContent | null {
  if (node.type === "text") {
    if (!node.text || node.text.length === 0) return null;
    return node;
  }

  const next: JSONContent = { ...node };
  if (Array.isArray(node.content)) {
    const content = node.content
      .map((child) => sanitizeNode(child))
      .filter((child): child is JSONContent => child !== null);
    if (content.length > 0) {
      next.content = content;
    } else {
      delete next.content;
    }
  }
  return next;
}
