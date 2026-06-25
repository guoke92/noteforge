import { WidgetType, type EditorView } from "@codemirror/view";
import { appendInlineMd } from "./inline-render";

export class TableBlockWidget extends WidgetType {
  constructor(
    private readonly header: string[],
    private readonly rows: string[][],
  ) {
    super();
  }

  eq(other: TableBlockWidget): boolean {
    return (
      other instanceof TableBlockWidget &&
      other.header.join("\0") === this.header.join("\0") &&
      other.rows.length === this.rows.length &&
      other.rows.every((row, i) => row.join("\0") === this.rows[i]!.join("\0"))
    );
  }

  toDOM(_view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-table-wrap";

    const table = document.createElement("table");
    table.className = "cm-md-table";

    if (this.header.length > 0) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      for (const cell of this.header) {
        const th = document.createElement("th");
        appendInlineMd(th, cell);
        tr.append(th);
      }
      thead.append(tr);
      table.append(thead);
    }

    if (this.rows.length > 0) {
      const tbody = document.createElement("tbody");
      for (const row of this.rows) {
        const tr = document.createElement("tr");
        const colCount = Math.max(this.header.length, row.length);
        for (let i = 0; i < colCount; i++) {
          const td = document.createElement("td");
          appendInlineMd(td, row[i] ?? "");
          tr.append(td);
        }
        tbody.append(tr);
      }
      table.append(tbody);
    }

    wrap.append(table);
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export function parseTableRow(text: string): string[] {
  const t = text.trim();
  if (!t.startsWith("|")) return [];
  const inner = t.endsWith("|") ? t.slice(1, -1) : t.slice(1);
  return inner.split("|").map((c) => c.trim());
}
