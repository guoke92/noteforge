import { Decoration } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import type { DecoSpec } from "./deco-builder";
import { isSyntaxInactive } from "./cursor-range";
import { MarkdownImageWidget } from "./image-widget";
import { markdownVaultPathFacet } from "./markdown-context";
import { hideSyntaxReplace } from "./syntax-hide";
import { TaskCheckboxWidget } from "./task-checkbox-widget";
import { decorateInlineFallbackForLine } from "./inline-fallback";

function pushHide(specs: DecoSpec[], view: EditorView, from: number, to: number) {
  if (from < to && isSyntaxInactive(view, from, to)) {
    specs.push({ from, to, deco: hideSyntaxReplace(), kind: "replace" });
  }
}

function lineDeco(lineFrom: number, className: string): DecoSpec {
  return {
    from: lineFrom,
    to: lineFrom,
    kind: "line",
    deco: Decoration.line({ class: className }),
  };
}

function headingLevel(name: string): number | null {
  const m = /^ATXHeading(\d)$/.exec(name);
  return m ? Number(m[1]) : null;
}

function decorateWikiLinks(
  specs: DecoSpec[],
  view: EditorView,
  lineFrom: number,
  text: string,
): void {
  const wikiRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = wikiRe.exec(text))) {
    const start = lineFrom + m.index;
    const end = start + m[0].length;
    pushHide(specs, view, start, start + 2);
    pushHide(specs, view, end - 2, end);
    specs.push({
      from: start + 2,
      to: end - 2,
      kind: "mark",
      deco: Decoration.mark({
        class: "cm-wiki-link",
        attributes: { "data-wiki": m[1]!.trim() },
      }),
    });
  }
}

export function collectTreeDecorations(
  view: EditorView,
  fromLine: number,
  toLine: number,
  docLen: number,
): { specs: DecoSpec[]; tableLines: Set<number>; imageLines: Set<number> } {
  const specs: DecoSpec[] = [];
  const tableLines = new Set<number>();
  const imageLines = new Set<number>();
  const noteVaultPath = view.state.facet(markdownVaultPathFacet);
  const doc = view.state.doc;
  const tree = syntaxTree(view.state);

  tree.iterate({
    enter(node) {
      const lineNum = doc.lineAt(node.from).number;
      if (lineNum < fromLine || lineNum > toLine) return;

      const name = node.type.name;

      if (name === "Table" || name === "TableHeader" || name === "TableRow" || name === "TableCell") {
        return false;
      }

      if (name === "HeaderMark") {
        pushHide(specs, view, node.from, node.to);
        return;
      }

      const hLevel = headingLevel(name);
      if (hLevel !== null) {
        const text = doc.sliceString(node.from, node.to);
        const prefix = text.match(/^#+\s*/);
        const bodyStart = prefix ? node.from + prefix[0].length : node.from;
        pushHide(specs, view, node.from, bodyStart);
        if (bodyStart < node.to && isSyntaxInactive(view, node.from, node.to)) {
          specs.push({
            from: bodyStart,
            to: node.to,
            kind: "mark",
            deco: Decoration.mark({
              class: `cm-md-heading cm-md-h${hLevel}`,
            }),
          });
        }
        return false;
      }

      if (name === "QuoteMark") {
        pushHide(specs, view, node.from, node.to);
        const line = doc.lineAt(node.from);
        if (isSyntaxInactive(view, line.from, line.to)) {
          specs.push(lineDeco(line.from, "cm-md-blockquote"));
        }
        return;
      }

      if (name === "ListMark") {
        pushHide(specs, view, node.from, node.to);
        return;
      }

      if (name === "TaskMarker") {
        const line = doc.lineAt(node.from);
        const prefix = doc.sliceString(line.from, node.from);
        const bullet = prefix.match(/^(\s*)([-*+])\s+$/);
        if (bullet) {
          pushHide(specs, view, line.from, node.from);
        }
        if (isSyntaxInactive(view, node.from, node.to)) {
          const marker = doc.sliceString(node.from, node.to);
          const checked = /\[x\]/i.test(marker);
          specs.push({
            from: node.from,
            to: node.to,
            kind: "replace",
            deco: Decoration.replace({
              inclusive: false,
              widget: new TaskCheckboxWidget(node.from, node.to, checked),
            }),
          });
        }
        return;
      }

      if (name === "EmphasisMark" || name === "StrikethroughMark") {
        pushHide(specs, view, node.from, node.to);
        return;
      }

      if (name === "StrongEmphasis") {
        if (isSyntaxInactive(view, node.from, node.to)) {
          pushHide(specs, view, node.from, node.from + 2);
          pushHide(specs, view, node.to - 2, node.to);
          specs.push({
            from: node.from + 2,
            to: node.to - 2,
            kind: "mark",
            deco: Decoration.mark({ class: "cm-md-bold" }),
          });
        }
        return false;
      }

      if (name === "Emphasis") {
        if (isSyntaxInactive(view, node.from, node.to)) {
          pushHide(specs, view, node.from, node.from + 1);
          pushHide(specs, view, node.to - 1, node.to);
          specs.push({
            from: node.from + 1,
            to: node.to - 1,
            kind: "mark",
            deco: Decoration.mark({ class: "cm-md-italic" }),
          });
        }
        return false;
      }

      if (name === "Strikethrough") {
        if (isSyntaxInactive(view, node.from, node.to)) {
          pushHide(specs, view, node.from, node.from + 2);
          pushHide(specs, view, node.to - 2, node.to);
          specs.push({
            from: node.from + 2,
            to: node.to - 2,
            kind: "mark",
            deco: Decoration.mark({ class: "cm-md-strike" }),
          });
        }
        return false;
      }

      if (name === "InlineCode") {
        if (isSyntaxInactive(view, node.from, node.to)) {
          pushHide(specs, view, node.from, node.from + 1);
          pushHide(specs, view, node.to - 1, node.to);
          specs.push({
            from: node.from + 1,
            to: node.to - 1,
            kind: "mark",
            deco: Decoration.mark({ class: "cm-md-inline-code" }),
          });
        }
        return false;
      }

      if (name === "CodeMark" || name === "CodeInfo") {
        pushHide(specs, view, node.from, node.to);
        return;
      }

      if (name === "FencedCode") {
        const inactive = isSyntaxInactive(view, node.from, node.to);
        if (inactive) {
          tree.iterate({
            from: node.from,
            to: node.to,
            enter(child) {
              if (child.name === "CodeMark" || child.name === "CodeInfo") {
                specs.push({
                  from: child.from,
                  to: child.to,
                  kind: "replace",
                  deco: hideSyntaxReplace(),
                });
              }
            },
          });
          for (let pos = node.from; pos < node.to; ) {
            const line = doc.lineAt(pos);
            if (line.from >= docLen) break;
            specs.push(lineDeco(line.from, "cm-md-code-fence"));
            pos =
              line.number < doc.lines ? doc.line(line.number + 1).from : node.to;
          }
        }
        return false;
      }

      if (name === "Image") {
        const line = doc.lineAt(node.from);
        const nodeText = doc.sliceString(node.from, node.to);
        const isWholeLine = line.text.trim() === nodeText.trim();
        if (isWholeLine && isSyntaxInactive(view, line.from, line.to)) {
          let alt = "";
          let src = "";
          tree.iterate({
            from: node.from,
            to: node.to,
            enter(child) {
              if (child.name === "URL") {
                src = doc.sliceString(child.from, child.to);
                return false;
              }
            },
          });
          const altMatch = nodeText.match(/!\[([^\]]*)\]/);
          if (altMatch) alt = altMatch[1] ?? "";
          specs.push({
            from: line.from,
            to: line.to,
            kind: "replace",
            deco: Decoration.replace({
              inclusive: false,
              widget: new MarkdownImageWidget(alt, src, noteVaultPath),
            }),
          });
          imageLines.add(line.number);
        }
        return false;
      }

      if (name === "Link") {
        const text = doc.sliceString(node.from, node.to);
        if (text.startsWith("![") || text.startsWith("[[")) return;

        let urlFrom = node.to;
        let urlTo = node.to;
        tree.iterate({
          from: node.from,
          to: node.to,
          enter(child) {
            if (child.name === "URL") {
              urlFrom = child.from;
              urlTo = child.to;
              return false;
            }
          },
        });

        const labelStart = node.from + 1;
        const bracketClose = doc.sliceString(node.from, urlFrom).lastIndexOf("]");
        const labelEnd =
          bracketClose >= 0 ? node.from + bracketClose : urlFrom;

        pushHide(specs, view, node.from, labelStart);
        pushHide(specs, view, labelEnd, node.to);
        if (labelStart < labelEnd) {
          const href = doc.sliceString(urlFrom, urlTo);
          specs.push({
            from: labelStart,
            to: labelEnd,
            kind: "mark",
            deco: Decoration.mark({
              class: "cm-md-link",
              attributes: { "data-href": href },
            }),
          });
        }
        return false;
      }

      if (name === "HorizontalRule") {
        const line = doc.lineAt(node.from);
        if (isSyntaxInactive(view, line.from, line.to)) {
          pushHide(specs, view, line.from, line.to);
          specs.push(lineDeco(line.from, "cm-md-hr"));
        }
        return false;
      }
    },
  });

  for (let i = fromLine; i <= toLine; i++) {
    if (tableLines.has(i) || imageLines.has(i)) continue;
    const line = doc.line(i);
    if (line.length === 0 || line.from >= docLen) continue;
    decorateWikiLinks(specs, view, line.from, line.text);
    decorateInlineFallbackForLine(specs, view, line.from, line.text, line.to);
  }

  return { specs, tableLines, imageLines };
}
