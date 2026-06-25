import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { buildDecorationSet, type DecoSpec } from "./deco-builder";
import { isSyntaxInactive } from "./cursor-range";
import { MarkdownImageWidget } from "./image-widget";
import { liveModeField } from "./mode-field";
import { markdownVaultPathFacet } from "./markdown-context";
import { applyTableBlockDecorations, scanTableBlocks } from "./table-blocks";
import { collectTreeDecorations } from "./tree-decorations";

const IMAGE_LINE_RE = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/;

function visibleLineRange(view: EditorView): { fromLine: number; toLine: number } {
  const doc = view.state.doc;
  const docLen = doc.length;
  if (docLen === 0) return { fromLine: 1, toLine: 1 };

  const vpFrom = Math.min(view.viewport.from, docLen - 1);
  const vpTo = Math.min(Math.max(view.viewport.to, vpFrom + 1), docLen);
  const buffer = 40;
  const fromLine = Math.max(1, doc.lineAt(vpFrom).number - buffer);
  const toLine = Math.min(doc.lines, doc.lineAt(vpTo).number + buffer);
  return { fromLine, toLine };
}

function applyRegexTableBlocks(
  specs: DecoSpec[],
  view: EditorView,
  fromLine: number,
  toLine: number,
  docLen: number,
  tableLines: Set<number>,
): void {
  const doc = view.state.doc;
  for (const block of scanTableBlocks(doc)) {
    if (tableLines.has(block.startLine)) continue;
    if (block.endLine < fromLine || block.startLine > toLine) continue;
    applyTableBlockDecorations(specs, view, doc, block, docLen, tableLines);
  }
}

function applyRegexImageLines(
  specs: DecoSpec[],
  view: EditorView,
  fromLine: number,
  toLine: number,
  docLen: number,
  imageLines: Set<number>,
): void {
  const doc = view.state.doc;
  const noteVaultPath = view.state.facet(markdownVaultPathFacet);

  for (let i = fromLine; i <= toLine; i++) {
    if (imageLines.has(i)) continue;
    const line = doc.line(i);
    if (line.length === 0 || line.from >= docLen) continue;

    const m = IMAGE_LINE_RE.exec(line.text);
    if (!m || !isSyntaxInactive(view, line.from, line.to)) continue;

    specs.push({
      from: line.from,
      to: line.to,
      kind: "replace",
      deco: Decoration.replace({
        inclusive: false,
        widget: new MarkdownImageWidget(m[1] ?? "", m[2] ?? "", noteVaultPath),
      }),
    });
    imageLines.add(i);
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  if (!view.state.field(liveModeField)) {
    return Decoration.none;
  }

  const docLen = view.state.doc.length;
  const { fromLine, toLine } = visibleLineRange(view);
  const { specs, tableLines, imageLines } = collectTreeDecorations(
    view,
    fromLine,
    toLine,
    docLen,
  );

  applyRegexTableBlocks(specs, view, fromLine, toLine, docLen, tableLines);
  applyRegexImageLines(specs, view, fromLine, toLine, docLen, imageLines);

  return buildDecorationSet(specs, docLen);
}

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const treeChanged =
        syntaxTree(update.startState) !== syntaxTree(update.state);
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        treeChanged ||
        update.startState.field(liveModeField) !== update.state.field(liveModeField)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
