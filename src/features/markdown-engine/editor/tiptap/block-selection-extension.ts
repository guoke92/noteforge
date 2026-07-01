import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { NodeSelection } from "@tiptap/pm/state";

const BLOCK_SELECTOR =
  "blockquote, .md-code-block, .tableWrapper, ul, ol, figure.md-image-block, hr";

function findBlockElement(view: EditorView): HTMLElement | null {
  const { selection } = view.state;
  if (selection instanceof NodeSelection) {
    const nodeDom = view.nodeDOM(selection.from);
    if (nodeDom instanceof HTMLElement) {
      const block = nodeDom.closest(BLOCK_SELECTOR);
      return block instanceof HTMLElement ? block : null;
    }
  }

  const domAt = view.domAtPos(selection.from);
  const node = domAt.node;
  const start = node instanceof HTMLElement ? node : node.parentElement;
  if (!start) return null;
  const block = start.closest(BLOCK_SELECTOR);
  return block instanceof HTMLElement ? block : null;
}

export const BlockSelectionExtension = Extension.create({
  name: "blockSelection",

  addProseMirrorPlugins() {
    let active: HTMLElement | null = null;

    const clear = () => {
      if (active) {
        active.classList.remove("md-block-active");
        active = null;
      }
    };

    const sync = (view: EditorView) => {
      clear();
      const next = findBlockElement(view);
      if (!next) return;
      next.classList.add("md-block-active");
      active = next;
    };

    return [
      new Plugin({
        view(view) {
          sync(view);
          return {
            update(v, prev) {
              if (v.state.selection !== prev.selection) sync(v);
            },
            destroy: clear,
          };
        },
      }),
    ];
  },
});
