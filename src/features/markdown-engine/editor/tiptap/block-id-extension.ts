import { Extension } from "@tiptap/core";

/** Persists Route A block id on top-level nodes for mode-switch anchor mapping. */
export const BlockIdExtension = Extension.create({
  name: "blockId",

  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "codeBlock",
          "blockquote",
          "horizontalRule",
          "image",
          "table",
          "bulletList",
          "orderedList",
          "taskList",
          "rawMarkdown",
        ],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute("data-block-id"),
            renderHTML: (attrs: { blockId?: string | null }) =>
              attrs.blockId ? { "data-block-id": attrs.blockId as string } : {},
          },
        },
      },
    ];
  },
});
