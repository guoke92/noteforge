import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { isInTable } from "@tiptap/pm/tables";
import { moveIntoTable, moveVerticalInSameColumn } from "./table-grid-utils";

export const TableKeyboardExtension = Extension.create({
  name: "tableKeyboard",

  priority: 10000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(editorView) {
          const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

            const dir = event.key === "ArrowUp" ? -1 : 1;
            const inside = isInTable(editorView.state);

            if (inside) {
              if (!moveVerticalInSameColumn(editorView, dir)) return;
            } else {
              if (!moveIntoTable(editorView, dir)) return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
          };

          editorView.dom.addEventListener("keydown", onKeyDown, true);
          return {
            destroy() {
              editorView.dom.removeEventListener("keydown", onKeyDown, true);
            },
          };
        },
      }),
    ];
  },
});
