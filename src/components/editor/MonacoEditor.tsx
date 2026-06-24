import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as monacoNs from "monaco-editor";
import { useThemeStore } from "@/store/theme";
import { useEditorStore } from "@/store/editor";
import type { EditorTab } from "@/store/editor";
import { useWorkspaceStore } from "@/store/workspace";
import { useAIStore } from "@/store/ai";
import { tabDisplayLanguage } from "@/lib/editor-doc";
import { collectMarkdownNotes, searchWikiTitles } from "@/lib/wiki-resolve";
import { getCore } from "@/core/runtime";
import { resolveSurfaceMode } from "@/lib/surface-mode";
import type { EditorSurfaceMode } from "@/core/document/types";
import type { LiveSurfaceHandle } from "@/core/editor/surface-handle";
import { getTierConfig } from "@/core/document/file-tier";
import type { DocumentRecord } from "@/core/document/types";
import { createContentDebouncer } from "@/core/editor/content-debouncer";
import { monacoLanguageId } from "@/lib/language-registry";
import { perfLog, perfStart } from "@/lib/startup-perf";
import { AIFloatingToolbar } from "./AIFloatingToolbar";
import { useDocumentRecord } from "@/hooks/useDocumentContent";
import { useLargeFileOverrides } from "@/store/large-file-overrides";
import {
  acquireMonacoSlot,
  isHeavyFileTier,
  largeMonacoSlotLimit,
  releaseMonacoSlot,
} from "@/core/editor/monaco-slot";

function applyDocMonacoOptions(
  editor: monacoNs.editor.IStandaloneCodeEditor,
  doc: DocumentRecord,
  advancedMonaco: boolean,
) {
  const useAdvanced = doc.tier === "normal" || advancedMonaco;
  const tierCfg = getTierConfig(useAdvanced ? "normal" : doc.tier);
  editor.updateOptions({
    minimap: { enabled: tierCfg.monaco.minimap },
    folding: tierCfg.monaco.folding,
    bracketPairColorization: { enabled: tierCfg.monaco.bracketPairColorization },
    wordBasedSuggestions: tierCfg.monaco.wordBasedSuggestions,
    formatOnPaste: tierCfg.monaco.formatOnPaste,
    quickSuggestions: tierCfg.monaco.quickSuggestions,
    readOnly: doc.tier === "huge" && doc.contentLoaded ? false : tierCfg.readOnly,
  });
}

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
  markdownVariant: _markdownVariant = "default",
  hostSurfaceMode,
  onCursorLineChange,
  bindEditor,
}: Props) {
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hostHandleRef = useRef<LiveSurfaceHandle | null>(null);
  const wikiProviderRef = useRef<monacoNs.IDisposable | null>(null);
  const cursorLineCbRef = useRef(onCursorLineChange);
  cursorLineCbRef.current = onCursorLineChange;
  const bindEditorRef = useRef(bindEditor);
  bindEditorRef.current = bindEditor;
  const tabIdRef = useRef(tab.id);
  const documentIdRef = useRef(tab.documentId);
  tabIdRef.current = tab.id;
  documentIdRef.current = tab.documentId;

  const contentDebouncerRef = useRef(
    createContentDebouncer({
      shouldEmit(content) {
        const doc = getCore().document.get(documentIdRef.current);
        return !!doc && content !== doc.content;
      },
      onEmit(content) {
        useEditorStore.getState().updateContent(tabIdRef.current, content);
      },
    }),
  );

  const doc = useDocumentRecord(tab.documentId);
  const advancedMonaco = useLargeFileOverrides((s) =>
    doc ? s.isEnabled(tab.documentId, doc.tier, "advancedMonaco") : false,
  );
  const needsHeavySlot = doc != null && isHeavyFileTier(doc.tier);
  const [slotGranted, setSlotGranted] = useState(() => !needsHeavySlot);

  useEffect(() => {
    if (!needsHeavySlot) {
      setSlotGranted(true);
      return;
    }
    const granted = acquireMonacoSlot(tab.id);
    setSlotGranted(granted);
    return () => {
      releaseMonacoSlot(tab.id);
    };
  }, [tab.id, needsHeavySlot]);

  const debouncedUpdateContent = useCallback((value: string) => {
    contentDebouncerRef.current.schedule(value);
  }, []);

  useEffect(() => {
    return () => {
      bindEditorRef.current?.(null);
      contentDebouncerRef.current.cancel();
      const ed = editorRef.current;
      if (ed) {
        const model = ed.getModel();
        ed.dispose();
        if (model && !model.isDisposed()) {
          model.dispose();
        }
        editorRef.current = null;
      }
      hostHandleRef.current = null;
    };
  }, [tab.id, tab.documentId]);
  const [editor, setEditor] = useState<monacoNs.editor.IStandaloneCodeEditor | null>(null);
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
    const endMount = perfStart("editor.monaco.onMount", {
      tabId: tab.id,
      documentId: tab.documentId,
      language: tab.language,
    });
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

    // Set initial content from DocumentService (non-controlled)
    const doc = getCore().document.get(tab.documentId);
    if (doc) {
      editor.getModel()?.setValue(doc.content);
    }

    // Restore view state AFTER content is set (setValue resets cursor/scroll)
    if (doc?.viewState) {
      const { cursor, scroll } = doc.viewState;
      if (cursor) {
        editor.setPosition({ lineNumber: cursor.line, column: cursor.column });
      }
      if (scroll) {
        editor.setScrollTop(scroll.scrollTop);
      }
    }

    // Apply tier-based Monaco options for large files
    if (doc) {
      applyDocMonacoOptions(editor, doc, advancedMonaco);
    }

    // Register surface handle for flush/external-content (all tabs)
    const surfaceMode = hostSurfaceMode ?? resolveSurfaceMode(tab);
    const handle: LiveSurfaceHandle = {
      mode: surfaceMode,
      flush() {
        const m = editor.getModel();
        if (!m) return null;
        contentDebouncerRef.current.flushPending();
        const content = m.getValue();
        const currentDoc = getCore().document.get(tab.documentId);
        if (!currentDoc || content === currentDoc.content) return null;
        return { kind: "replace-all" as const, content };
      },
      revealLine(line: number) {
        binding.revealLine(line);
        return true;
      },
      applyExternalContent(content: string) {
        const m = editor.getModel();
        if (!m || m.getValue() === content) return;
        const position = editor.getPosition();
        const scrollTop = editor.getScrollTop();
        m.setValue(content);
        if (position) editor.setPosition(position);
        editor.setScrollTop(scrollTop);
      },
      focus() {
        editor.focus();
      },
      captureViewState() {
        const pos = editor.getPosition();
        return {
          cursor: pos ? { line: pos.lineNumber, column: pos.column } : undefined,
          scroll: { scrollTop: editor.getScrollTop() },
        };
      },
      restoreViewState(state) {
        if (state.cursor) {
          editor.setPosition({ lineNumber: state.cursor.line, column: state.cursor.column });
        }
        if (state.scroll) {
          editor.setScrollTop(state.scroll.scrollTop);
        }
      },
    };
    hostHandleRef.current = handle;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => editor.layout());
    });
    endMount();
  };

  useEffect(() => {
    const ed = editorRef.current;
    const container = containerRef.current;
    if (!ed || !container) return;

    const layout = () => ed.layout();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(layout);
    });
    ro.observe(container);
    requestAnimationFrame(layout);
    return () => ro.disconnect();
  }, [editor]);

  useEffect(() => {
    const handle = hostHandleRef.current;
    if (!editor || !handle) return;
    const surfaceMode = hostSurfaceMode ?? resolveSurfaceMode(tab);
    return getCore().editorHost.registerSurface(
      tab.id,
      tab.documentId,
      surfaceMode,
      handle,
    );
  }, [editor, tab.id, tab.documentId, hostSurfaceMode, tab.surfaceMode]);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !doc) return;
    applyDocMonacoOptions(ed, doc, advancedMonaco);
  }, [doc, advancedMonaco, editor]);

  useEffect(() => {
    const eventBus = getCore().eventBus;
    return eventBus.subscribe("document:changed", (event) => {
      if (event.documentId !== tab.documentId) return;
      const next = getCore().document.get(tab.documentId);
      if (!next?.contentLoaded) return;
      hostHandleRef.current?.applyExternalContent(next.content);
    });
  }, [tab.documentId]);

  const displayLang = tabDisplayLanguage(tab);
  const isMarkdown = displayLang === "markdown";
  const isMarkdownSource = isMarkdown && _markdownVariant === "source";

  if (needsHeavySlot && !slotGranted) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-text-secondary">
        <div>
          <p className="mb-2 text-base text-text-primary">大文件编辑器已达同时打开上限</p>
          <p className="text-sm opacity-80">
            当前最多同时加载 {largeMonacoSlotLimit()} 个大文件编辑器。请关闭或切换其他大文件标签后再试。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full min-h-0 w-full overflow-hidden">
      <Editor
        key={tab.id}
        height="100%"
        language={monacoLanguageId(displayLang)}
        theme={themeMode === "dark" ? "vs-dark" : "light"}
        value={undefined}
        onChange={(v) => debouncedUpdateContent(v || "")}
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
          automaticLayout: true,
          // Source mode: keep table rows intact; word-wrap + split resize can corrupt line layout.
          wordWrap: isMarkdown && !isMarkdownSource ? "on" : "off",
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
