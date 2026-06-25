import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { Compartment, EditorState, type Extension, Prec, type StateEffect } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  placeholder,
} from "@codemirror/view";
import { liveModeField, setLiveModeEffect } from "./mode-field";
import { livePreviewPlugin } from "./live-preview";
import { markdownVaultPathFacet } from "./markdown-context";
import { markdownEditorTheme } from "./theme";

export interface CreateMarkdownEditorOptions {
  parent: HTMLElement;
  content: string;
  live: boolean;
  dark: boolean;
  vaultPath?: string | null;
  placeholderText?: string;
  onChange?: (content: string) => void;
  onCaretChange?: (status: {
    line: number;
    column: number;
    selectionChars: number;
    selectionLines: number;
  }) => void;
  onWikiLinkClick?: (label: string) => void;
  onMarkdownLinkClick?: (href: string) => void;
  onEditorFocus?: () => void;
}

const syntaxCompartment = new Compartment();

function syntaxExtensions(live: boolean): Extension {
  if (live) return [];
  return [syntaxHighlighting(defaultHighlightStyle, { fallback: true })];
}

export function createMarkdownEditor(opts: CreateMarkdownEditorOptions): EditorView {
  const onChange = opts.onChange;
  const onCaret = opts.onCaretChange;

  const publishCaret = (view: EditorView) => {
    if (!onCaret) return;
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.head);
    let selectionChars = 0;
    let selectionLines = 0;
    if (!sel.empty) {
      selectionChars = sel.to - sel.from;
      const startLine = view.state.doc.lineAt(sel.from).number;
      const endLine = view.state.doc.lineAt(sel.to).number;
      selectionLines = endLine - startLine + 1;
    }
    onCaret({
      line: line.number,
      column: sel.head - line.from + 1,
      selectionChars,
      selectionLines,
    });
  };

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && onChange) {
      onChange(update.state.doc.toString());
    }
    if (update.selectionSet) {
      publishCaret(update.view);
    }
  });

  const wikiClick = EditorView.domEventHandlers({
    focus() {
      opts.onEditorFocus?.();
      return false;
    },
    mousedown() {
      opts.onEditorFocus?.();
      return false;
    },
    click(event) {
      const target = event.target as HTMLElement | null;
      const wiki = target?.closest?.("[data-wiki]") as HTMLElement | null;
      if (wiki?.dataset.wiki) {
        opts.onWikiLinkClick?.(wiki.dataset.wiki);
        return true;
      }
      const link = target?.closest?.("[data-href]") as HTMLAnchorElement | null;
      if (link?.dataset.href) {
        const href = link.dataset.href;
        if (/^https?:/i.test(href)) {
          window.open(href, "_blank", "noopener,noreferrer");
        } else {
          opts.onMarkdownLinkClick?.(href);
        }
        return true;
      }
      return false;
    },
  });

  const extensions: Extension[] = [
    liveModeField.init(() => opts.live),
    markdownVaultPathFacet.of(opts.vaultPath ?? null),
    history(),
    drawSelection(),
    highlightActiveLine(),
    markdown({ base: markdownLanguage }),
    syntaxCompartment.of(syntaxExtensions(opts.live)),
    markdownEditorTheme(opts.dark),
    livePreviewPlugin,
    updateListener,
    wikiClick,
    EditorView.lineWrapping,
    keymap.of([...defaultKeymap, ...historyKeymap]),
    Prec.low(
      EditorView.theme({
        "&.cm-focused": { outline: "none" },
      }),
    ),
  ];

  if (opts.placeholderText) {
    extensions.push(placeholder(opts.placeholderText));
  }

  const state = EditorState.create({
    doc: opts.content,
    extensions,
  });

  const view = new EditorView({ state, parent: opts.parent });
  if (!opts.live) {
    view.dispatch({ effects: setLiveModeEffect.of(false) });
  }
  publishCaret(view);
  return view;
}

export function setEditorLiveMode(view: EditorView, live: boolean): void {
  const effects: StateEffect<unknown>[] = [];
  if (view.state.field(liveModeField) !== live) {
    effects.push(setLiveModeEffect.of(live));
  }
  effects.push(syntaxCompartment.reconfigure(syntaxExtensions(live)));
  if (effects.length > 0) {
    view.dispatch({ effects });
  }
}

export function setEditorContent(view: EditorView, content: string): void {
  if (view.state.doc.toString() === content) return;
  const sel = view.state.selection;
  const scrollTop = view.scrollDOM.scrollTop;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
    selection: sel,
  });
  view.scrollDOM.scrollTop = scrollTop;
}

export function revealEditorLine(view: EditorView, line: number): boolean {
  const clamped = Math.max(1, Math.min(line, view.state.doc.lines));
  const lineObj = view.state.doc.line(clamped);
  view.dispatch({
    selection: { anchor: lineObj.from },
    effects: EditorView.scrollIntoView(lineObj.from, { y: "center" }),
  });
  view.focus();
  return true;
}

export function captureEditorViewState(view: EditorView): {
  cursor?: { line: number; column: number };
  scroll?: { scrollTop: number };
} {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  return {
    cursor: { line: line.number, column: pos - line.from + 1 },
    scroll: { scrollTop: view.scrollDOM.scrollTop },
  };
}

export function restoreEditorViewState(
  view: EditorView,
  state: { cursor?: { line: number; column: number }; scroll?: { scrollTop: number } },
): void {
  if (state.cursor) {
    const ln = Math.min(state.cursor.line, view.state.doc.lines);
    const line = view.state.doc.line(ln);
    const col = Math.min(state.cursor.column, line.length + 1);
    view.dispatch({
      selection: { anchor: line.from + col - 1 },
    });
  }
  if (state.scroll) {
    view.scrollDOM.scrollTop = state.scroll.scrollTop;
  }
}
