import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export function markdownEditorTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: "var(--color-bg-primary)",
        color: "var(--color-text-primary)",
        fontSize: "15px",
        lineHeight: "1.7",
      },
      ".cm-scroller": {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        overflow: "auto",
      },
      ".cm-content": {
        padding: "20px 24px 48px",
        maxWidth: "48rem",
        margin: "0 auto",
        caretColor: "var(--color-accent, #b5b5b5)",
      },
      ".cm-line": {
        padding: "0 2px",
      },
      ".cm-gutters": {
        display: "none",
      },
      ".cm-activeLine": {
        backgroundColor: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
      },
      ".cm-selectionBackground": {
        backgroundColor: dark
          ? "rgba(100,149,237,0.25) !important"
          : "rgba(0,100,200,0.18) !important",
      },
      ".cm-md-syntax-hidden": {
        display: "inline-block",
        width: "0",
        height: "0",
        overflow: "hidden",
        verticalAlign: "baseline",
        pointerEvents: "none",
      },
      ".cm-md-h1": { fontSize: "1.75em", fontWeight: "600", lineHeight: "1.3" },
      ".cm-md-h2": { fontSize: "1.4em", fontWeight: "600", lineHeight: "1.35" },
      ".cm-md-h3": { fontSize: "1.2em", fontWeight: "600", lineHeight: "1.4" },
      ".cm-md-h4": { fontSize: "1.05em", fontWeight: "600" },
      ".cm-md-h5": { fontSize: "1em", fontWeight: "600" },
      ".cm-md-h6": {
        fontSize: "0.95em",
        fontWeight: "600",
        color: "var(--color-text-secondary)",
      },
      ".cm-md-heading": { display: "inline" },
      ".cm-md-blockquote": {
        borderLeft: "3px solid var(--color-border)",
        paddingLeft: "12px",
        color: "var(--color-text-secondary)",
      },
      ".cm-md-table-wrap": {
        display: "block",
        width: "100%",
        margin: "8px 0 12px",
        overflowX: "auto",
      },
      ".cm-md-table": {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "0.95em",
        lineHeight: "1.5",
      },
      ".cm-md-table th, .cm-md-table td": {
        border: dark
          ? "1px solid rgba(255,255,255,0.22)"
          : "1px solid rgba(0,0,0,0.16)",
        padding: "8px 12px",
        textAlign: "left",
        verticalAlign: "top",
      },
      ".cm-md-table th": {
        fontWeight: "600",
        backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
      },
      ".cm-md-table tbody tr:nth-child(even)": {
        backgroundColor: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
      },
      ".cm-line:has(.cm-md-table-line-hidden)": {
        height: "0",
        lineHeight: "0",
        overflow: "hidden",
        padding: "0",
        margin: "0",
      },
      ".cm-md-table-line-hidden": {
        display: "none",
      },
      ".cm-md-hr": {
        borderBottom: dark
          ? "1px solid rgba(255,255,255,0.2)"
          : "1px solid rgba(0,0,0,0.15)",
        lineHeight: "0.6em",
        height: "0.6em",
      },
      ".cm-wiki-link": {
        color: "var(--color-accent, #3b82f6)",
        cursor: "pointer",
        textDecoration: "none",
      },
      ".cm-wiki-link:hover": {
        textDecoration: "underline",
      },
      ".cm-md-bold": { fontWeight: "700" },
      ".cm-md-italic": { fontStyle: "italic" },
      ".cm-md-strike": { textDecoration: "line-through", opacity: "0.85" },
      ".cm-md-task-checkbox": {
        marginRight: "4px",
        verticalAlign: "middle",
        cursor: "pointer",
        accentColor: "var(--color-accent, #3b82f6)",
      },
      ".cm-md-inline-code": {
        fontFamily: "SF Mono, Fira Code, monospace",
        fontSize: "0.9em",
        backgroundColor: "var(--color-bg-tertiary)",
        borderRadius: "3px",
        padding: "0 3px",
      },
      ".cm-md-link": {
        color: "var(--color-accent, #3b82f6)",
        cursor: "pointer",
        textDecoration: "none",
      },
      ".cm-md-link:hover": {
        textDecoration: "underline",
      },
      ".cm-md-image-alt": {
        color: "var(--color-accent, #3b82f6)",
        fontStyle: "italic",
      },
      ".cm-md-image-block": {
        display: "block",
        width: "100%",
        margin: "12px 0",
        textAlign: "center",
      },
      ".cm-line:has(.cm-md-image-block)": {
        display: "block",
      },
      ".cm-md-image": {
        maxWidth: "100%",
        height: "auto",
        borderRadius: "6px",
        border: "1px solid var(--color-border)",
      },
      ".cm-md-image-caption": {
        marginTop: "6px",
        fontSize: "0.85em",
        color: "var(--color-text-secondary)",
      },
      ".cm-md-image-block--loading": {
        minHeight: "0",
      },
      ".cm-md-image-block--error .cm-md-image-fallback": {
        display: "inline-block",
        padding: "8px 12px",
        borderRadius: "4px",
        backgroundColor: "var(--color-bg-tertiary)",
        color: "var(--color-text-secondary)",
        fontStyle: "italic",
      },
      ".cm-md-code-fence": {
        fontFamily: "SF Mono, Fira Code, ui-monospace, monospace",
        fontSize: "0.88em",
        backgroundColor: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
        padding: "1px 12px",
      },
      ".cm-md-table strong": {
        fontWeight: "700",
      },
      ".cm-md-table em": {
        fontStyle: "italic",
      },
      ".cm-md-table code": {
        fontFamily: "SF Mono, Fira Code, ui-monospace, monospace",
        fontSize: "0.9em",
        backgroundColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
        borderRadius: "3px",
        padding: "0 3px",
      },
    },
    { dark },
  );
}
