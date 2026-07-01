import type { Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { TextSelection } from "@tiptap/pm/state";
import { cellAround } from "@tiptap/pm/tables";

export function getActiveTableElement(view: EditorView): HTMLTableElement | null {
  const $cell = cellAround(view.state.selection.$from);
  if (!$cell) return null;
  const dom = view.nodeDOM($cell.pos);
  if (!(dom instanceof HTMLElement)) return null;
  const table = dom.closest("table");
  return table instanceof HTMLTableElement ? table : null;
}

/** Grid column index accounting for colspan. */
export function getGridColumnIndex(cell: HTMLTableCellElement): number {
  const row = cell.parentElement;
  if (!(row instanceof HTMLTableRowElement)) return cell.cellIndex;
  let col = 0;
  for (let i = 0; i < row.cells.length; i += 1) {
    const current = row.cells.item(i);
    if (!current) continue;
    if (current === cell) return col;
    col += current.colSpan || 1;
  }
  return col;
}

export function findCellAtGridColumn(
  row: HTMLTableRowElement,
  gridCol: number,
): HTMLTableCellElement | null {
  let col = 0;
  for (let i = 0; i < row.cells.length; i += 1) {
    const cell = row.cells.item(i);
    if (!cell) continue;
    const span = cell.colSpan || 1;
    if (gridCol >= col && gridCol < col + span) return cell;
    col += span;
  }
  return row.cells.item(Math.max(0, row.cells.length - 1));
}

export function getTableColumnCount(table: HTMLTableElement): number {
  let max = 0;
  for (const row of table.rows) {
    let cols = 0;
    for (const cell of row.cells) cols += cell.colSpan || 1;
    max = Math.max(max, cols);
  }
  return max;
}

function getActiveTableCell(view: EditorView): HTMLTableCellElement | null {
  const $cell = cellAround(view.state.selection.$from);
  if (!$cell) return null;
  const dom = view.nodeDOM($cell.pos);
  if (dom instanceof HTMLTableCellElement) return dom;
  if (dom instanceof HTMLElement) {
    const cell = dom.closest("td, th");
    return cell instanceof HTMLTableCellElement ? cell : null;
  }
  return null;
}

export function focusCellAtGrid(
  editor: Editor,
  rowIndex: number,
  gridCol: number,
): boolean {
  const table = getActiveTableElement(editor.view);
  if (!table) return false;
  const row = table.rows.item(Math.min(Math.max(0, rowIndex), table.rows.length - 1));
  if (!row) return false;
  const cell = findCellAtGridColumn(row, gridCol);
  if (!cell) return false;

  const rect = cell.getBoundingClientRect();
  const coords = editor.view.posAtCoords({
    left: rect.left + Math.min(12, Math.max(4, rect.width / 2)),
    top: rect.top + Math.min(12, Math.max(4, rect.height / 2)),
  });
  if (!coords) return false;

  const tr = editor.state.tr.setSelection(
    TextSelection.create(editor.state.doc, coords.pos),
  );
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

export function insertTableRowAt(
  editor: Editor,
  rowIndex: number,
  position: "before" | "after",
): void {
  const table = getActiveTableElement(editor.view);
  if (!table) return;
  const rows = table.rows.length;
  const anchorRow = Math.min(Math.max(0, rowIndex), rows - 1);
  if (!focusCellAtGrid(editor, anchorRow, 0)) return;
  if (position === "before") editor.chain().focus().addRowBefore().run();
  else editor.chain().focus().addRowAfter().run();
}

export function insertTableColumnAt(
  editor: Editor,
  colIndex: number,
  position: "before" | "after",
): void {
  const table = getActiveTableElement(editor.view);
  if (!table) return;
  const cols = getTableColumnCount(table);
  const anchorCol = Math.min(Math.max(0, colIndex), cols - 1);
  if (!focusCellAtGrid(editor, 0, anchorCol)) return;
  if (position === "before") editor.chain().focus().addColumnBefore().run();
  else editor.chain().focus().addColumnAfter().run();
}

/**
 * Whether the caret sits at the very last visual line of the current cell
 * (used for "down should leave the cell" detection).
 *
 * TipTap's `endOfTextblock("down")` is unreliable inside table cells that hold
 * multiple paragraphs, so we inspect the cell DOM geometry directly.
 */
function isAtBottomEdgeOfCell(view: EditorView): boolean {
  const cell = getActiveTableCell(view);
  if (!cell) return false;

  const { selection } = view.state;
  if (!selection.empty) return false;

  const $from = selection.$from;
  if ($from.parent.type.spec.tableRole === "cell") {
    if ($from.parentOffset < $from.parent.content.size) return false;
  }

  const range = view.domAtPos($from.pos);
  const caretNode =
    range.node.nodeType === Node.TEXT_NODE ? range.node.parentElement : (range.node as HTMLElement);
  if (!(caretNode instanceof HTMLElement)) return false;

  const caretRect = caretNode.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  return caretRect.bottom - cellRect.bottom >= -1.5;
}

function isAtTopEdgeOfCell(view: EditorView): boolean {
  const cell = getActiveTableCell(view);
  if (!cell) return false;

  const { selection } = view.state;
  if (!selection.empty) return false;

  const $from = selection.$from;
  if ($from.parentOffset > 0) return false;

  const range = view.domAtPos($from.pos);
  const caretNode =
    range.node.nodeType === Node.TEXT_NODE ? range.node.parentElement : (range.node as HTMLElement);
  if (!(caretNode instanceof HTMLElement)) return false;

  const caretRect = caretNode.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  return cellRect.top - caretRect.top >= -1.5;
}

export function moveVerticalInSameColumn(view: EditorView, dir: -1 | 1): boolean {
  const cell = getActiveTableCell(view);
  if (!cell) return false;

  const atEdge = dir < 0 ? isAtTopEdgeOfCell(view) : isAtBottomEdgeOfCell(view);
  if (!atEdge) return false;

  const row = cell.parentElement;
  const table = cell.closest("table");
  if (!(row instanceof HTMLTableRowElement) || !(table instanceof HTMLTableElement)) return false;

  const gridCol = getGridColumnIndex(cell);
  const targetRow = table.rows.item(row.rowIndex + dir);
  if (!targetRow) return false;

  const targetCell = findCellAtGridColumn(targetRow, gridCol);
  if (!targetCell) return false;

  const cellRect = cell.getBoundingClientRect();
  const targetRect = targetCell.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (cellRect.height - 2) > 0 ? (cellRect.height - 2) : 1));
  const enterTop = dir < 0 ? targetRect.bottom - 4 : targetRect.top + 4;
  const fallback = ratio;
  void fallback;

  const coords = view.posAtCoords({
    left: cellRect.left + Math.min(12, Math.max(4, cellRect.width / 2)),
    top: enterTop,
  });
  if (!coords) return false;

  const selection = TextSelection.near(view.state.doc.resolve(coords.pos), dir);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  return true;
}

/**
 * When the caret enters the table from outside via ↑/↓, land on the first/last
 * row of the source-side column. TipTap's default behavior lands at the line
 * start (not end) and may pick a wrong column when rowspan/colspan are present.
 */
export function moveIntoTable(view: EditorView, dir: -1 | 1): boolean {
  if (!getActiveTableElement(view)) return false;
  const $from = view.state.selection.$from;
  if ($from.parent.type.spec.tableRole === "cell") return false;

  const table = getActiveTableElement(view);
  if (!table) return false;
  const targetRow = dir < 0 ? table.rows.item(0) : table.rows.item(table.rows.length - 1);
  if (!targetRow) return false;
  const cell = targetRow.cells.item(0);
  if (!cell) return false;

  const rect = cell.getBoundingClientRect();
  const coords = view.posAtCoords({
    left: rect.left + Math.min(12, Math.max(4, rect.width / 2)),
    top: dir < 0 ? rect.top + 4 : rect.bottom - 4,
  });
  if (!coords) return false;

  const selection =
    dir < 0
      ? TextSelection.near(view.state.doc.resolve(coords.pos), 1)
      : TextSelection.near(view.state.doc.resolve(coords.pos), -1);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  return true;
}

export type TableEdgeSlot = {
  id: string;
  side: "top" | "left" | "right" | "bottom";
  kind: "plus" | "minus";
  x: number;
  y: number;
  title: string;
  action: () => void;
};

export function measureTableEdgeSlots(
  table: HTMLTableElement,
  wrapper: HTMLElement,
  actions: {
    insertRow: (index: number, position: "before" | "after") => void;
    insertCol: (index: number, position: "before" | "after") => void;
    removeRow: (index: number) => void;
    removeCol: (index: number) => void;
  },
): TableEdgeSlot[] {
  const wrapperRect = wrapper.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const offsetX = tableRect.left - wrapperRect.left;
  const offsetY = tableRect.top - wrapperRect.top;
  const width = tableRect.width;
  const height = tableRect.height;

  const colBounds: number[] = [offsetX];
  const firstRow = table.rows.item(0);
  if (firstRow) {
    for (const cell of firstRow.cells) {
      colBounds.push(cell.getBoundingClientRect().right - wrapperRect.left);
    }
  }

  const rowBounds: number[] = [offsetY];
  for (const row of table.rows) {
    rowBounds.push(row.getBoundingClientRect().bottom - wrapperRect.top);
  }

  const lastColIndex = colBounds.length - 1;
  const lastRowIndex = rowBounds.length - 1;

  const slots: TableEdgeSlot[] = [];

  // 上边：列交点 → 插入列（+，向前插入）
  for (let i = 0; i < colBounds.length; i += 1) {
    slots.push({
      id: `top-col-${i}`,
      side: "top",
      kind: "plus",
      x: colBounds[i]!,
      y: offsetY,
      title: "在此处插入列",
      action: () => actions.insertCol(i, "before"),
    });
  }

  // 左边：行交点 → 插入行（+，向前插入）
  for (let i = 0; i < rowBounds.length; i += 1) {
    slots.push({
      id: `left-row-${i}`,
      side: "left",
      kind: "plus",
      x: offsetX,
      y: rowBounds[i]!,
      title: "在此处插入行",
      action: () => actions.insertRow(i, "before"),
    });
  }

  // 右边：行中点 → 删除行
  for (let i = 0; i < table.rows.length; i += 1) {
    const row = table.rows.item(i);
    if (!row) continue;
    const rowRect = row.getBoundingClientRect();
    slots.push({
      id: `right-row-${i}`,
      side: "right",
      kind: "minus",
      x: offsetX + width,
      y: rowRect.top - wrapperRect.top + rowRect.height / 2,
      title: "删除此行",
      action: () => actions.removeRow(i),
    });
  }

  // 下边：列中点 → 删除列
  for (let i = 0; i < (firstRow?.cells.length ?? 0); i += 1) {
    const cell = firstRow!.cells.item(i);
    if (!cell) continue;
    const rect = cell.getBoundingClientRect();
    slots.push({
      id: `bottom-col-${i}`,
      side: "bottom",
      kind: "minus",
      x: rect.left - wrapperRect.left + rect.width / 2,
      y: offsetY + height,
      title: "删除此列",
      action: () => actions.removeCol(i),
    });
  }

  void lastColIndex;
  void lastRowIndex;
  return slots;
}
