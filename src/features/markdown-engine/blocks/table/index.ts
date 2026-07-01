import type { TableAlign, TableModel, TableRow } from "../types";
import { parseInlineMarkdown, serializeInlineMarkdown } from "../inline";

export function parseTableRow(text: string): string[] {
  const t = text.trim();
  if (!t.startsWith("|")) return [];
  const inner = t.endsWith("|") ? t.slice(1, -1) : t.slice(1);
  const cells: string[] = [];
  let current = "";
  let escaping = false;
  for (const ch of inner) {
    if (escaping) {
      current += ch === "|" ? ch : `\\${ch}`;
      escaping = false;
      continue;
    }
    if (ch === "\\") {
      escaping = true;
      continue;
    }
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (escaping) current += "\\";
  cells.push(current.trim());
  return cells;
}

function isTableLine(text: string): boolean {
  const t = text.trim();
  return t.startsWith("|") && t.endsWith("|");
}

function isTableSeparator(text: string): boolean {
  return /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(text.trim());
}

function parseAlignFromSeparator(text: string): TableAlign[] {
  const cells = parseTableRow(text);
  return cells.map((cell) => {
    const t = cell.trim();
    const left = t.startsWith(":");
    const right = t.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "none";
  });
}

function rowFromCells(cells: string[]): TableRow {
  return {
    cells: cells.map((text) => ({ content: parseInlineMarkdown(text) })),
  };
}

function emptyCell() {
  return { content: parseInlineMarkdown("") };
}

function emptyRow(colCount: number): TableRow {
  return {
    cells: Array.from({ length: colCount }, () => emptyCell()),
  };
}

export function parseTableBlock(raw: string): TableModel {
  const lines = raw.split("\n").filter((line, idx, arr) => idx < arr.length - 1 || line.length > 0);
  const headerCells = parseTableRow(lines[0] ?? "");
  const align = parseAlignFromSeparator(lines[1] ?? "");
  const rows: TableRow[] = [];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i]!;
    if (!isTableLine(line) || isTableSeparator(line)) continue;
    rows.push(rowFromCells(parseTableRow(line)));
  }

  return {
    type: "table",
    header: rowFromCells(headerCells),
    align,
    rows,
  };
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function serializeRow(cells: TableRow, colCount: number): string {
  const values: string[] = [];
  for (let i = 0; i < colCount; i++) {
    const cell = cells.cells[i];
    const markdown = cell ? serializeInlineMarkdown(cell.content) : "";
    values.push(escapeCell(markdown));
  }
  return `| ${values.join(" | ")} |`;
}

function serializeSeparator(align: TableAlign[], colCount: number): string {
  const cells: string[] = [];
  for (let i = 0; i < colCount; i++) {
    const a = align[i] ?? "none";
    if (a === "center") cells.push(":---:");
    else if (a === "right") cells.push("---:");
    else if (a === "left") cells.push(":---");
    else cells.push("---");
  }
  return `| ${cells.join(" | ")} |`;
}

export function serializeTableBlock(model: TableModel): string {
  const colCount = Math.max(
    model.header.cells.length,
    ...model.rows.map((row) => row.cells.length),
    model.align.length,
  );
  const lines = [
    serializeRow(model.header, colCount),
    serializeSeparator(model.align, colCount),
    ...model.rows.map((row) => serializeRow(row, colCount)),
  ];
  return `${lines.join("\n")}\n`;
}

export function tableModelsEqual(a: TableModel, b: TableModel): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneTableModel(model: TableModel): TableModel {
  return JSON.parse(JSON.stringify(model)) as TableModel;
}

export function updateTableCell(
  model: TableModel,
  rowIndex: number,
  colIndex: number,
  plainText: string,
): TableModel {
  const next = cloneTableModel(model);
  const colCount = Math.max(
    next.header.cells.length,
    ...next.rows.map((row) => row.cells.length),
    next.align.length,
    colIndex + 1,
  );

  if (rowIndex < 0) {
    while (next.header.cells.length < colCount) {
      next.header.cells.push({ content: parseInlineMarkdown("") });
    }
    const cell = next.header.cells[colIndex] ?? { content: parseInlineMarkdown("") };
    cell.content = parseInlineMarkdown(plainText);
    next.header.cells[colIndex] = cell;
    return next;
  }

  const row = next.rows[rowIndex];
  if (!row) return next;
  while (row.cells.length < colCount) {
    row.cells.push({ content: parseInlineMarkdown("") });
  }
  const cell = row.cells[colIndex] ?? { content: parseInlineMarkdown("") };
  cell.content = parseInlineMarkdown(plainText);
  row.cells[colIndex] = cell;
  return next;
}

export function insertTableRowAfter(model: TableModel, rowIndex: number): TableModel {
  const next = cloneTableModel(model);
  const colCount = Math.max(
    next.header.cells.length,
    ...next.rows.map((row) => row.cells.length),
    next.align.length,
    1,
  );
  next.rows.splice(rowIndex + 1, 0, emptyRow(colCount));
  return next;
}

export function deleteTableRow(model: TableModel, rowIndex: number): TableModel {
  const next = cloneTableModel(model);
  if (next.rows.length <= 1 || rowIndex < 0 || rowIndex >= next.rows.length) return next;
  next.rows.splice(rowIndex, 1);
  return next;
}

export function insertTableColumnAfter(model: TableModel, colIndex: number): TableModel {
  const next = cloneTableModel(model);
  const insertAt = Math.max(0, colIndex + 1);
  next.header.cells.splice(insertAt, 0, emptyCell());
  next.align.splice(insertAt, 0, "none");
  for (const row of next.rows) {
    row.cells.splice(insertAt, 0, emptyCell());
  }
  return next;
}

export function deleteTableColumn(model: TableModel, colIndex: number): TableModel {
  const next = cloneTableModel(model);
  const colCount = Math.max(
    next.header.cells.length,
    ...next.rows.map((row) => row.cells.length),
    next.align.length,
  );
  if (colCount <= 1 || colIndex < 0 || colIndex >= colCount) return next;
  next.header.cells.splice(colIndex, 1);
  next.align.splice(colIndex, 1);
  for (const row of next.rows) {
    row.cells.splice(colIndex, 1);
  }
  return next;
}

export function isTableBlockRaw(raw: string): boolean {
  const lines = raw.split("\n").filter((line, idx, arr) => idx < arr.length - 1 || line.length > 0);
  if (lines.length < 2) return false;
  return isTableLine(lines[0]!) && isTableSeparator(lines[1]!);
}
