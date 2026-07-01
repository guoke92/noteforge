import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../../../codec";
import { editorDocumentToTiptapJson } from "../document-bridge";
import type { JSONContent } from "@tiptap/react";

function collectTextNodes(node: JSONContent, out: JSONContent[] = []): JSONContent[] {
  if (node.type === "text") out.push(node);
  for (const child of node.content ?? []) collectTextNodes(child, out);
  return out;
}

describe("editorDocumentToTiptapJson", () => {
  it("never emits empty text nodes", () => {
    const samples = [
      "",
      "\n\n",
      "# Title\n\n",
      "Hello\n\n\nWorld\n",
      "> \n\n- item\n\n```\n```\n",
    ];
    for (const md of samples) {
      const json = editorDocumentToTiptapJson(parseMarkdown(md));
      const texts = collectTextNodes(json);
      for (const t of texts) {
        expect(t.text?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});
