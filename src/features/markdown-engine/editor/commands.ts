import type { Editor } from "@tiptap/react";

/** Anti-corruption write API — surfaces must not call TipTap commands directly from UI chrome. */
export function toggleHeading(editor: Editor, level: 1 | 2 | 3 | 4 | 5 | 6): void {
  editor.chain().focus().toggleHeading({ level }).run();
}

export function insertTable(editor: Editor, rows = 3, cols = 3): void {
  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
}

export function deleteBlockAtSelection(editor: Editor): void {
  const { $from } = editor.state.selection;
  const depth = $from.depth;
  const pos = depth > 0 ? $from.before(1) : 0;
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
}

export function setParagraph(editor: Editor): void {
  editor.chain().focus().setParagraph().run();
}
