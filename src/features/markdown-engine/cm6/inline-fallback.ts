import { Decoration } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { DecoSpec } from "./deco-builder";
import { isSyntaxInactive } from "./cursor-range";
import { hideSyntaxReplace } from "./syntax-hide";

const BOLD_RE = /\*\*([^*]+)\*\*/g;
const ITALIC_RE = /(?<!\*)\*([^*]+)\*(?!\*)/g;
const CODE_RE = /`([^`]+)`/g;
const HR_LINE_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

function pushHide(
  specs: DecoSpec[],
  view: EditorView,
  from: number,
  to: number,
): void {
  if (from < to && isSyntaxInactive(view, from, to)) {
    specs.push({ from, to, deco: hideSyntaxReplace(), kind: "replace" });
  }
}

function pushMark(
  specs: DecoSpec[],
  view: EditorView,
  from: number,
  to: number,
  className: string,
): void {
  if (from < to && isSyntaxInactive(view, from, to)) {
    specs.push({
      from,
      to,
      kind: "mark",
      deco: Decoration.mark({ class: className }),
    });
  }
}

function decorateBoldItalicCodeOnLine(
  specs: DecoSpec[],
  view: EditorView,
  lineFrom: number,
  text: string,
  lineTo: number,
): void {
  if (!isSyntaxInactive(view, lineFrom, lineTo)) return;

  for (const m of text.matchAll(BOLD_RE)) {
    const start = lineFrom + m.index!;
    const end = start + m[0].length;
    pushHide(specs, view, start, start + 2);
    pushHide(specs, view, end - 2, end);
    pushMark(specs, view, start + 2, end - 2, "cm-md-bold");
  }

  for (const m of text.matchAll(CODE_RE)) {
    const start = lineFrom + m.index!;
    const end = start + m[0].length;
    pushHide(specs, view, start, start + 1);
    pushHide(specs, view, end - 1, end);
    pushMark(specs, view, start + 1, end - 1, "cm-md-inline-code");
  }

  for (const m of text.matchAll(ITALIC_RE)) {
    const start = lineFrom + m.index!;
    const end = start + m[0].length;
    pushHide(specs, view, start, start + 1);
    pushHide(specs, view, end - 1, end);
    pushMark(specs, view, start + 1, end - 1, "cm-md-italic");
  }
}

export function decorateInlineFallbackForLine(
  specs: DecoSpec[],
  view: EditorView,
  lineFrom: number,
  text: string,
  lineTo: number,
): void {
  decorateBoldItalicCodeOnLine(specs, view, lineFrom, text, lineTo);

  if (HR_LINE_RE.test(text) && isSyntaxInactive(view, lineFrom, lineTo)) {
    pushHide(specs, view, lineFrom, lineTo);
    specs.push({
      from: lineFrom,
      to: lineFrom,
      kind: "line",
      deco: Decoration.line({ class: "cm-md-hr" }),
    });
  }
}
