import type { Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

function lineRangeForSpan(
  doc: Text,
  from: number,
  to: number,
): { start: number; end: number; count: number } {
  const start = doc.lineAt(from).number;
  const end = doc.lineAt(Math.max(from, to > from ? to - 1 : from)).number;
  return { start, end, count: end - start + 1 };
}

/** True when any selection range overlaps [from, to). */
export function selectionOverlaps(
  view: EditorView,
  from: number,
  to: number,
): boolean {
  for (const range of view.state.selection.ranges) {
    if (range.from < to && from < range.to) return true;
  }
  return false;
}

/**
 * Typora-style syntax activation:
 * - single-line spans: raw syntax on the line where the cursor is
 * - multi-line spans (code fence, etc.): raw syntax while the cursor is inside the block
 */
export function isSyntaxInactive(
  view: EditorView,
  from: number,
  to: number,
): boolean {
  if (selectionOverlaps(view, from, to)) return false;

  const doc = view.state.doc;
  const span = lineRangeForSpan(doc, from, to);

  for (const range of view.state.selection.ranges) {
    const selStart = doc.lineAt(range.from).number;
    const selEnd = doc.lineAt(range.to).number;

    if (span.count > 1) {
      if (selStart <= span.end && span.start <= selEnd) return false;
    } else if (selStart <= span.start && span.start <= selEnd) {
      return false;
    }
  }
  return true;
}
