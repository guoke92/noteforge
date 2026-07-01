import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "../../../codec";
import { editorDocumentToTiptapJson } from "../document-bridge";
import { tiptapListToModel, listModelToTiptapJson } from "../list-bridge";

describe("list-bridge", () => {
  it("preserves nested bullet list indent", () => {
    const input = "- parent\n  - child\n  - sibling child\n- next\n";
    const doc = parseMarkdown(input);
    const json = editorDocumentToTiptapJson(doc);
    const listNode = json.content?.find(
      (node) => node.type === "bulletList" || node.type === "taskList",
    );
    expect(listNode?.type).toBe("bulletList");
    const firstItem = listNode?.content?.[0];
    const nested = firstItem?.content?.find((child) => child.type === "bulletList");
    expect(nested?.content?.length).toBe(2);

    const roundTrip = serializeMarkdown(doc);
    expect(roundTrip).toContain("- parent");
    expect(roundTrip).toContain("  - child");
  });

  it("round-trips task list through tiptap json", () => {
    const model = {
      type: "list" as const,
      items: [
        {
          indent: 0,
          ordered: false,
          checked: false,
          content: { nodes: [{ type: "text" as const, text: "todo" }] },
        },
        {
          indent: 0,
          ordered: false,
          checked: true,
          content: { nodes: [{ type: "text" as const, text: "done" }] },
        },
      ],
    };
    const json = listModelToTiptapJson(model, { blockId: "b1" });
    expect(json.type).toBe("taskList");
    const restored = tiptapListToModel(json);
    expect(restored.items).toHaveLength(2);
    expect(restored.items[1]?.checked).toBe(true);
  });
});
