import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import { useEditorStore } from "@/store/editor";

function offsetToLineColumn(docTextBefore: string): { line: number; column: number } {
  const parts = docTextBefore.split("\n");
  return {
    line: parts.length,
    column: (parts[parts.length - 1] ?? "").length + 1,
  };
}

export function createCaretStatusPlugin(tabId: string) {
  return $prose(() => {
    return new Plugin({
      view(view) {
        const report = () => {
          const { from, to } = view.state.selection;
          const doc = view.state.doc;
          const head = view.state.selection.$head.pos;
          const { line, column } = offsetToLineColumn(doc.textBetween(0, head, "\n", "\n"));

          const selected = from === to ? "" : doc.textBetween(from, to, "\n", "\n");
          const selectionChars = selected.length;
          const selectionLines = from === to ? 0 : selected.split("\n").length;

          useEditorStore.getState().reportCaretStatus(tabId, {
            line,
            column,
            selectionChars,
            selectionLines,
          });
        };

        report();
        return {
          update(view, prevState) {
            if (
              !view.state.selection.eq(prevState.selection) ||
              view.state.doc !== prevState.doc
            ) {
              report();
            }
          },
        };
      },
    });
  });
}
