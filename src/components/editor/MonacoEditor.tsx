import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as monacoNs from "monaco-editor";
import "@/lib/monaco-setup";
import { useThemeStore } from "@/store/theme";
import { useEditorStore } from "@/store/editor";
import type { EditorTab } from "@/store/editor";
import { useWorkspaceStore } from "@/store/workspace";
import { useAIStore } from "@/store/ai";
import { tabDisplayLanguage } from "@/lib/editor-doc";
import { collectMarkdownNotes, searchWikiTitles } from "@/lib/wiki-resolve";
import { getCore } from "@/core/runtime";
import type { EditorSurfaceMode } from "@/core/document/types";
import type { LiveSurfaceHandle } from "@/core/editor/surface-handle";
import { AIFloatingToolbar } from "./AIFloatingToolbar";

export type MarkdownEditorVariant = "default" | "source";

interface Props {
  tab: EditorTab;
  markdownVariant?: MarkdownEditorVariant;
  hostSurfaceMode?: EditorSurfaceMode;
  onCursorLineChange?: (line: number) => void;
  bindEditor?: (api: MonacoEditorBinding | null) => void;
}

export interface MonacoEditorBinding {
  revealLine: (line: number) => void;
  getScrollRatio: () => number;
  setScrollRatio: (ratio: number) => void;
  onDidScrollChange: (handler: () => void) => { dispose: () => void };
}

export function MonacoEditor({
  tab,
  markdownVariant = "default",
  hostSurfaceMode,
  onCursorLineChange,
  bindEditor,
}: Props) {
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const hostHandleRef = useRef<LiveSurfaceHandle | null>(null);
  const wikiProviderRef = useRef<monacoNs.IDisposable | null>(null);
  const cursorLineCbRef = useRef(onCursorLineChange);
  cursorLineCbRef.current = onCursorLineChange;
  const bindEditorRef = useRef(bindEditor);
  bindEditorRef.current = bindEditor;

  useEffect(() => {
    return () => bindEditorRef.current?.(null);
  }, [tab.id]);
  const [editor, setEditor] = useState<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const updateContent = useEditorStore((s) => s.updateContent);
  // const setLanguage = useEditorStore((s) => s.setLanguage);
  const themeMode = useThemeStore((s) => s.effective);
  const refine = useAIStore((s) => s.refineSelection);

  useEffect(() => {
    return () => {
      wikiProviderRef.current?.dispose();
      wikiProviderRef.current = null;
    };
  }, [tab.id]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    setEditor(editor);

    // Save: routed via CommandRegistry (ADR-007) — no duplicate Mod+S here.

    // Find (⌘F / Ctrl+F)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      editor.getAction("actions.find")?.run();
    });

    // Replace (⌘H / Ctrl+H)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => {
      editor.getAction("editor.action.startFindReplaceAction")?.run();
    });

    // Add selection to next find match (⌘D)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
      editor.getAction("editor.action.addSelectionToNextFindMatch")?.run();
    });

    // Toggle line comment (⌘/)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
      editor.getAction("editor.action.commentLine")?.run();
    });

    // Goto line (⌘L / Ctrl+G is default; we override to ⌘L per spec)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => {
      editor.getAction("editor.action.gotoLine")?.run();
    });

    // Move line up/down (⌥↑/↓)
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.UpArrow, () => {
      editor.getAction("editor.action.moveLinesUpAction")?.run();
    });
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.DownArrow, () => {
      editor.getAction("editor.action.moveLinesDownAction")?.run();
    });

    wikiProviderRef.current?.dispose();
    wikiProviderRef.current = monaco.languages.registerCompletionItemProvider("markdown", {
      triggerCharacters: ["["],
      provideCompletionItems(model, position) {
        const line = model.getLineContent(position.lineNumber);
        const before = line.slice(0, position.column - 1);
        const match = before.match(/\[\[([^\]|]*)$/);
        if (!match) return { suggestions: [] };

        const query = match[1] ?? "";
        const startColumn = position.column - query.length;
        const range = {
          startLineNumber: position.lineNumber,
          startColumn,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };
        const tree = useWorkspaceStore.getState().tree;
        const notes = collectMarkdownNotes(tree);
        const hits = searchWikiTitles(query, notes, 20);
        return {
          suggestions: hits.map((hit) => ({
            label: hit.title,
            kind: monaco.languages.CompletionItemKind.File,
            insertText: hit.title,
            range,
            detail: hit.path,
          })),
        };
      },
    });

    // AI refine selection
    editor.addAction({
      id: "noteforge.ai.refine",
      label: "AI: 精炼选中内容",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE],
      contextMenuGroupId: "noteforge",
      contextMenuOrder: 1,
      run: (ed) => {
        const sel = ed.getSelection();
        if (!sel) return;
        const text = ed.getModel()?.getValueInRange(sel) || "";
        if (text.trim().length < 5) return;
        const instruction = useAIStore.getState().instruction;
        void refine(text, instruction);
      },
    });

    // Wrap toggle
    editor.addAction({
      id: "noteforge.editor.toggleWrap",
      label: "切换自动换行",
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
      run: (ed) => {
        const opt = ed.getOption(monaco.editor.EditorOption.wordWrap);
        ed.updateOptions({ wordWrap: opt === "on" ? "off" : "on" });
      },
    });

    const publishCaretStatus = () => {
      const model = editor.getModel();
      if (!model) return;
      const position = editor.getPosition() ?? { lineNumber: 1, column: 1 };
      const selection = editor.getSelection();
      let selectionChars = 0;
      let selectionLines = 0;
      if (selection && !selection.isEmpty()) {
        const selected = model.getValueInRange(selection);
        selectionChars = selected.length;
        selectionLines = selection.endLineNumber - selection.startLineNumber + 1;
      }
      useEditorStore.getState().reportCaretStatus(tab.id, {
        line: position.lineNumber,
        column: position.column,
        selectionChars,
        selectionLines,
      });
      cursorLineCbRef.current?.(position.lineNumber);
    };

    editor.onDidChangeCursorPosition(publishCaretStatus);
    editor.onDidChangeCursorSelection(publishCaretStatus);
    publishCaretStatus();

    const binding: MonacoEditorBinding = {
      revealLine(line: number) {
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: 1 });
        editor.focus();
      },
      getScrollRatio() {
        const scrollTop = editor.getScrollTop();
        const scrollHeight = editor.getScrollHeight();
        const height = editor.getLayoutInfo().height;
        const max = scrollHeight - height;
        return max <= 0 ? 0 : scrollTop / max;
      },
      setScrollRatio(ratio: number) {
        const scrollHeight = editor.getScrollHeight();
        const height = editor.getLayoutInfo().height;
        const max = scrollHeight - height;
        editor.setScrollTop(Math.max(0, Math.min(max, ratio * max)));
      },
      onDidScrollChange(handler: () => void) {
        return editor.onDidScrollChange(handler);
      },
    };
    bindEditorRef.current?.(binding);

    if (hostSurfaceMode) {
      hostHandleRef.current = {
        mode: hostSurfaceMode,
        flush() {
          const model = editor.getModel();
          if (!model) return null;
          const content = model.getValue();
          const doc = getCore().document.get(tab.id);
          if (!doc || content === doc.content) return null;
          return { kind: "replace-all", content };
        },
        revealLine(line: number) {
          binding.revealLine(line);
          return true;
        },
        applyExternalContent(content: string) {
          const model = editor.getModel();
          if (!model || model.getValue() === content) return;
          const position = editor.getPosition();
          const scrollTop = editor.getScrollTop();
          model.setValue(content);
          if (position) editor.setPosition(position);
          editor.setScrollTop(scrollTop);
        },
        focus() {
          editor.focus();
        },
        captureViewState() {
          const pos = editor.getPosition();
          return {
            cursor: pos
              ? { line: pos.lineNumber, column: pos.column }
              : undefined,
            scroll: { scrollTop: editor.getScrollTop() },
          };
        },
        restoreViewState(state) {
          if (state.cursor) {
            editor.setPosition({
              lineNumber: state.cursor.line,
              column: state.cursor.column,
            });
          }
          if (state.scroll) {
            editor.setScrollTop(state.scroll.scrollTop);
          }
        },
      };
    }
  };

  useEffect(() => {
    if (!hostSurfaceMode) return;
    const handle = hostHandleRef.current;
    if (!handle) return;
    return getCore().editorHost.registerSurface(tab.id, hostSurfaceMode, handle);
  }, [tab.id, hostSurfaceMode, editor]);

  useEffect(() => {
    if (hostSurfaceMode) {
      getCore().editorHost.applyExternalContent(tab.id, tab.content);
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.hasTextFocus()) return;
    const model = editor.getModel();
    if (!model || model.getValue() === tab.content) return;
    const position = editor.getPosition();
    const scrollTop = editor.getScrollTop();
    model.setValue(tab.content);
    if (position) editor.setPosition(position);
    editor.setScrollTop(scrollTop);
  }, [tab.content, hostSurfaceMode, tab.id]);

  // Sync language to monaco model when tab.language changes
  useEffect(() => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (model) {
      // language is updated through the Editor `language` prop on next render
    }
  }, [tab.language]);

  const displayLang = tabDisplayLanguage(tab);
  const isMarkdown = displayLang === "markdown";

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <Editor
        key={tab.id}
        height="100%"
        language={mapLanguage(displayLang)}
        theme={themeMode === "dark" ? "vs-dark" : "light"}
        value={tab.content}
        onChange={(v) => updateContent(tab.id, v || "")}
        onMount={onMount}
        beforeMount={(monaco) => {
          // Cap Markdown / YAML diagnostics noise
          monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
            validate: true,
            allowComments: false,
            schemas: [],
            schemaValidation: "warning",
          });
        }}
        options={{
          fontFamily: "SF Mono, Fira Code, Cascadia Code, JetBrains Mono, monospace",
          fontSize: 14,
          lineHeight: 22,
          minimap: { enabled: true, side: "right", scale: 1 },
          smoothScrolling: true,
          padding: { top: 12, bottom: 12 },
          wordWrap: isMarkdown ? "on" : "off",
          renderWhitespace: "selection",
          tabSize: 2,
          bracketPairColorization: { enabled: true },
          guides: { indentation: true, bracketPairs: true },
          scrollBeyondLastLine: false,
          largeFileOptimizations: true,
          folding: true,
          foldingStrategy: "indentation",
          renderLineHighlight: "all",
          lineNumbers: "on",
          glyphMargin: false,
          multiCursorModifier: "alt",
          formatOnPaste: true,
          formatOnType: false,
          quickSuggestions: { other: true, comments: false, strings: false },
          suggestOnTriggerCharacters: true,
          parameterHints: { enabled: true },
          wordBasedSuggestions: "currentDocument",
          scrollbar: {
            vertical: "auto",
            horizontal: "auto",
            verticalScrollbarSize: 10,
          },
        }}
      />
      <AIFloatingToolbar editor={editor} />
    </div>
  );
}

function mapLanguage(language: string): string {
  // Map our internal language names to Monaco IDs
  return (
    {
      markdown: "markdown",
      json: "json",
      yaml: "yaml",
      typescript: "typescript",
      javascript: "javascript",
      python: "python",
      rust: "rust",
      go: "go",
      java: "java",
      cpp: "cpp",
      html: "html",
      css: "css",
      shell: "shell",
      sql: "sql",
      xml: "xml",
      toml: "ini",
      plaintext: "plaintext",
    }[language] || "plaintext"
  );
}
