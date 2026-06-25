import type { Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { DecoSpec } from "./deco-builder";
import { isSyntaxInactive } from "./cursor-range";
import { collapseLineReplace } from "./syntax-hide";
import { parseTableRow, TableBlockWidget } from "./table-widget";

export type TableBlock = {
  startLine: number;
  endLine: number;
  from: number;
  to: number;
  header: string[];
  rows: string[][];
};

function isTableLine(text: string): boolean {
  const t = text.trim();
  return t.startsWith("|") && t.endsWith("|");
}

function isTableSeparator(text: string): boolean {
  return /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(text.trim());
}

export function scanTableBlocks(doc: Text): TableBlock[] {
  const blocks: TableBlock[] = [];
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (!isTableLine(line.text) || isTableSeparator(line.text)) continue;
    if (i + 1 > doc.lines || !isTableSeparator(doc.line(i + 1).text)) continue;

    const header = parseTableRow(line.text);
    const rows: string[][] = [];
    let j = i + 2;
    while (j <= doc.lines) {
      const rowLine = doc.line(j);
      if (!isTableLine(rowLine.text) || isTableSeparator(rowLine.text)) break;
      rows.push(parseTableRow(rowLine.text));
      j++;
    }

    const endLine = j - 1;
    blocks.push({
      startLine: i,
      endLine,
      from: line.from,
      to: doc.line(endLine).to,
      header,
      rows,
    });
    i = endLine;
  }
  return blocks;
}

export function applyTableBlockDecorations(
  specs: DecoSpec[],
  view: EditorView,
  doc: Text,
  block: TableBlock,
  docLen: number,
  tableLines: Set<number>,
): void {
  if (!isSyntaxInactive(view, block.from, block.to)) return;

  const headerLine = doc.line(block.startLine);
  if (headerLine.from >= docLen || headerLine.to > docLen) return;

  specs.push({
    from: headerLine.from,
    to: headerLine.to,
    kind: "replace",
    deco: Decoration.replace({
      inclusive: false,
      widget: new TableBlockWidget(block.header, block.rows),
    }),
  });

  for (let ln = block.startLine + 1; ln <= block.endLine; ln++) {
    const line = doc.line(ln);
    if (line.length === 0 || line.from >= docLen || line.to > docLen) continue;
    specs.push({
      from: line.from,
      to: line.to,
      kind: "replace",
      deco: collapseLineReplace(),
    });
    tableLines.add(ln);
  }
  tableLines.add(block.startLine);
}
