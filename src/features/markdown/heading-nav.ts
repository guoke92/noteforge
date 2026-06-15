import type { Crepe } from "@milkdown/crepe";
import { EditorStatus } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";

/** Extract heading text from a 1-based markdown line number. */
export function headingTextAtLine(content: string, line: number): string | null {
  const row = content.split("\n")[line - 1];
  if (!row) return null;
  const match = row.match(/^#{1,6}\s+(.+)$/);
  return match ? match[1]!.trim() : null;
}

/** Scroll Milkdown/ProseMirror to the heading that matches the markdown line. */
export function revealHeadingInCrepe(crepe: Crepe, content: string, line: number): boolean {
  if (crepe.editor.status !== EditorStatus.Created) return false;

  const target = headingTextAtLine(content, line);
  if (!target) return false;

  let revealed = false;

  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const needle = target.toLowerCase();

    view.state.doc.descendants((node, pos) => {
      if (revealed || node.type.name !== "heading") return;
      if (node.textContent.trim().toLowerCase() !== needle) return;

      const dom = view.nodeDOM(pos);
      if (dom instanceof HTMLElement) {
        dom.scrollIntoView({ block: "center", behavior: "smooth" });
      }

      const selection = TextSelection.create(view.state.doc, pos + 1);
      view.dispatch(view.state.tr.setSelection(selection));
      view.focus();
      revealed = true;
    });
  });

  return revealed;
}
