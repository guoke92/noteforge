/** Caret + selection snapshot for the status bar (IDEA / RustRover style). */
export interface EditorCaretStatus {
  line: number;
  column: number;
  selectionChars: number;
  selectionLines: number;
}

export const DEFAULT_CARET_STATUS: EditorCaretStatus = {
  line: 1,
  column: 1,
  selectionChars: 0,
  selectionLines: 0,
};

function formatCharCount(count: number): string {
  return count === 1 ? "1 char" : `${count} chars`;
}

function formatLineCount(count: number): string {
  return count === 1 ? "1 line" : `${count} lines`;
}

/** Selection summary shown after Ln/Col when text is selected. */
export function formatSelectionSummary(status: EditorCaretStatus): string | null {
  if (status.selectionChars <= 0) return null;
  if (status.selectionLines <= 1) {
    return formatCharCount(status.selectionChars);
  }
  return `${formatLineCount(status.selectionLines)}, ${formatCharCount(status.selectionChars)}`;
}
