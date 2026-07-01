import { Extension } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

const BLOCK_NODE_TYPES = new Set(["image", "codeBlock", "horizontalRule", "table"]);

export const BlockChromeExtension = Extension.create({
  name: "blockChrome",

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { selection } = this.editor.state;
        if (!(selection instanceof NodeSelection)) return false;
        const type = selection.node.type.name;
        if (!BLOCK_NODE_TYPES.has(type)) return false;
        return this.editor.commands.deleteSelection();
      },
      Delete: () => {
        const { selection } = this.editor.state;
        if (!(selection instanceof NodeSelection)) return false;
        const type = selection.node.type.name;
        if (!BLOCK_NODE_TYPES.has(type)) return false;
        return this.editor.commands.deleteSelection();
      },
      Escape: () => {
        const { selection } = this.editor.state;
        if (!(selection instanceof NodeSelection)) return false;
        return this.editor.commands.focus(selection.to, { scrollIntoView: false });
      },
    };
  },
});
