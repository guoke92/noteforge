import { Node, mergeAttributes } from "@tiptap/core";

/** Preserves frontmatter / unknown raw markdown as a non-WYSIWYG block in live mode. */
export const RawMarkdownNode = Node.create({
  name: "rawMarkdown",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      raw: { default: "" },
      blockId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="raw-markdown"]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "raw-markdown",
        class: "md-raw-block",
      }),
      HTMLAttributes.raw as string,
    ];
  },
});
