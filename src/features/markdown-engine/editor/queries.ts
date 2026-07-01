import type { Editor } from "@tiptap/react";

export function isHeadingActive(editor: Editor, level?: number): boolean {
  if (level) return editor.isActive("heading", { level });
  return editor.isActive("heading");
}

export function getCurrentBlockType(editor: Editor): string {
  if (editor.isActive("heading")) return `heading${editor.getAttributes("heading").level ?? ""}`;
  if (editor.isActive("codeBlock")) return "code";
  if (editor.isActive("blockquote")) return "blockquote";
  if (editor.isActive("table")) return "table";
  if (editor.isActive("bulletList")) return "bulletList";
  if (editor.isActive("orderedList")) return "orderedList";
  if (editor.isActive("taskList")) return "taskList";
  if (editor.isActive("horizontalRule")) return "hr";
  if (editor.isActive("image")) return "image";
  return "paragraph";
}

export function getActiveBlockId(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    const blockId = node.attrs.blockId as string | null;
    if (blockId) return blockId;
  }
  return null;
}
