import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { cellAround } from "@tiptap/pm/tables";
import { Plus, Minus } from "lucide-react";
import {
  insertTableColumnAt,
  insertTableRowAt,
  measureTableEdgeSlots,
  type TableEdgeSlot,
} from "../editor/tiptap/table-grid-utils";

function findActiveTableHost(editor: Editor): {
  wrapper: HTMLElement;
  table: HTMLTableElement;
} | null {
  const { view, state } = editor;
  if (!editor.isActive("table")) return null;
  const $cell = cellAround(state.selection.$from);
  if (!$cell) return null;
  const dom = view.nodeDOM($cell.pos);
  if (!(dom instanceof HTMLElement)) return null;
  const table = dom.closest("table");
  if (!(table instanceof HTMLTableElement)) return null;
  const wrapper = table.closest(".tableWrapper");
  if (!(wrapper instanceof HTMLElement)) return null;
  return { wrapper, table };
}

export function TableBlockChrome({ editor }: { editor: Editor }) {
  const [host, setHost] = useState<{ wrapper: HTMLElement; table: HTMLTableElement } | null>(
    null,
  );
  const [slots, setSlots] = useState<TableEdgeSlot[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const remeasure = useCallback(() => {
    const next = findActiveTableHost(editor);
    setHost(next);
    if (!next) {
      setSlots([]);
      return;
    }
    const measured = measureTableEdgeSlots(next.table, next.wrapper, {
      insertRow: (index, position) => insertTableRowAt(editor, index, position),
      insertCol: (index, position) => insertTableColumnAt(editor, index, position),
      removeRow: (index) => {
        if (typeof index !== "number") return;
        focusRow(editor, index);
        editor.chain().focus().deleteRow().run();
      },
      removeCol: (index) => {
        if (typeof index !== "number") return;
        focusColumn(editor, index);
        editor.chain().focus().deleteColumn().run();
      },
    });
    setSlots(measured);
  }, [editor]);

  useEffect(() => {
    remeasure();
    editor.on("selectionUpdate", remeasure);
    editor.on("transaction", remeasure);
    window.addEventListener("resize", remeasure);
    return () => {
      editor.off("selectionUpdate", remeasure);
      editor.off("transaction", remeasure);
      window.removeEventListener("resize", remeasure);
    };
  }, [editor, remeasure]);

  useEffect(() => {
    if (!host) return;
    const observer = new ResizeObserver(() => remeasure());
    observer.observe(host.table);
    observer.observe(host.wrapper);
    return () => observer.disconnect();
  }, [host, remeasure]);

  if (!host) return null;

  return createPortal(
    <div className="md-table-edge-layer" aria-hidden={slots.length === 0}>
      {slots.map((slot) => (
        <div
          key={slot.id}
          className={`md-table-edge-zone md-table-edge-zone--${slot.side} md-table-edge-zone--${slot.kind}`}
          style={{ left: slot.x, top: slot.y }}
          onMouseEnter={() => setHoveredId(slot.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          {hoveredId === slot.id ? (
            <button
              type="button"
              className={`md-table-edge-btn md-table-edge-btn--${slot.kind}`}
              title={slot.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                slot.action();
                requestAnimationFrame(remeasure);
              }}
            >
              {slot.kind === "plus" ? <Plus size={12} strokeWidth={2.5} /> : <Minus size={12} strokeWidth={2.5} />}
            </button>
          ) : null}
        </div>
      ))}
    </div>,
    host.wrapper,
  );
}

function focusRow(editor: Editor, rowIndex: number): void {
  const table = editor.view.dom.querySelector(".ProseMirror-selectednode table") as
    | HTMLTableElement
    | null;
  const target =
    table ?? (editor.view.domAtPos(editor.state.selection.from).node as HTMLElement | Text)?.parentElement?.closest("table");
  const tbl = target instanceof HTMLTableElement ? target : null;
  if (!tbl) return;
  const row = tbl.rows.item(rowIndex);
  if (!row) return;
  const cell = row.cells.item(0);
  if (!cell) return;
  const rect = cell.getBoundingClientRect();
  const coords = editor.view.posAtCoords({
    left: rect.left + 6,
    top: rect.top + 6,
  });
  if (coords) {
    editor.commands.setTextSelection(coords.pos);
  }
}

function focusColumn(editor: Editor, colIndex: number): void {
  const tbl = editor.view.dom.querySelector("table") as HTMLTableElement | null;
  if (!tbl) return;
  const firstRow = tbl.rows.item(0);
  if (!firstRow) return;
  const cell = firstRow.cells.item(colIndex);
  if (!cell) return;
  const rect = cell.getBoundingClientRect();
  const coords = editor.view.posAtCoords({
    left: rect.left + 6,
    top: rect.top + 6,
  });
  if (coords) {
    editor.commands.setTextSelection(coords.pos);
  }
}
