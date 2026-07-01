import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { EditorTab } from "@/store/editor";
import { useThemeStore } from "@/store/theme";
import { getCore, ensureDocumentContentLoaded } from "@/core/runtime";
import type { DocumentRecord } from "@/core/document/types";
import type { LiveSurfaceHandle } from "@/core/editor/surface-handle";
import { resolveSurfaceMode } from "@/lib/surface-mode";
import { perfLog } from "@/lib/startup-perf";
import { useTabStripApi } from "@/contexts/tab-strip-api";
import { useDocumentRecord } from "@/hooks/useDocumentContent";
import {
  lineToCharOffset,
  locateAnchorInDocument,
  locateAnchorInMarkdown,
  parseMarkdown,
  serializeMarkdown,
} from "../codec";
import type { ModeSwitchAnchor } from "./schema";
import { editorDocumentToTiptapJson, tiptapJsonToEditorDocument } from "./tiptap/document-bridge";
import { createTiptapExtensions } from "./tiptap/extensions";
import { getActiveBlockId } from "./queries";
import { EditorSurfaceProvider } from "./editor-surface-context";
import { TableBlockChrome } from "../node-views/TableBlockChrome";
import { BlockHoverActions } from "../node-views/BlockHoverActions";
import "./editor.css";

interface Props {
  tab: EditorTab;
}

function resolveSurfaceContent(doc: DocumentRecord | null | undefined): string {
  if (!doc) return "";
  const diskContent = doc.disk?.content ?? "";
  if (doc.content.length > 0) return doc.content;
  if (!doc.dirty && diskContent.length > 0) return diskContent;
  if (doc.dirty && diskContent.trim().length > 0) return diskContent;
  return doc.content;
}

function syncContent(
  documentId: string,
  content: string,
  lastSyncedRef: React.MutableRefObject<string>,
): void {
  if (content === lastSyncedRef.current) return;
  const doc = getCore().document.get(documentId);
  if (!doc || !doc.contentLoaded) return;
  if (content === doc.content) {
    lastSyncedRef.current = content;
    return;
  }
  getCore().document.applyPatch(documentId, { kind: "replace-all", content });
  lastSyncedRef.current = content;
}

function recoverAccidentalEmptyDocument(documentId: string): void {
  const doc = getCore().document.get(documentId);
  const diskContent = doc?.disk?.content ?? "";
  if (doc?.dirty && doc.content.length === 0 && diskContent.trim().length > 0) {
    void getCore().document.revert(documentId);
  }
}

function revealSourceLine(textarea: HTMLTextAreaElement, line: number): boolean {
  const lines = textarea.value.split("\n");
  if (line < 1 || line > lines.length) return false;
  const offset = lineToCharOffset(textarea.value, line, 1);
  textarea.focus();
  textarea.setSelectionRange(offset, offset);
  const lineHeight = parseInt(getComputedStyle(textarea).lineHeight, 10) || 24;
  textarea.scrollTop = Math.max(0, (line - 1) * lineHeight - textarea.clientHeight / 3);
  return true;
}

function isEditorUsable(editor: Editor | null): editor is Editor {
  return !!editor && !editor.isDestroyed;
}

function readEditorMarkdown(editor: Editor): string {
  return serializeMarkdown(tiptapJsonToEditorDocument(editor.getJSON()));
}

function applyTiptapMarkdown(
  editor: Editor,
  markdown: string,
  lastSyncedRef: React.MutableRefObject<string>,
  suppressSyncRef: React.MutableRefObject<boolean>,
): void {
  if (!isEditorUsable(editor)) return;
  suppressSyncRef.current = true;
  editor.commands.setContent(editorDocumentToTiptapJson(parseMarkdown(markdown)), {
    emitUpdate: false,
  });
  lastSyncedRef.current = markdown;
  queueMicrotask(() => {
    suppressSyncRef.current = false;
  });
}

function LiveEditor({
  tab,
  markdown,
  lastSyncedRef,
  suppressSyncRef,
  onReady,
}: {
  tab: EditorTab;
  markdown: string;
  lastSyncedRef: React.MutableRefObject<string>;
  suppressSyncRef: React.MutableRefObject<boolean>;
  onReady: (handle: LiveSurfaceHandle) => void;
}) {
  const effective = useThemeStore((s) => s.effective);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tabStripApi = useTabStripApi();
  const appliedMarkdownRef = useRef(markdown);

  const editor = useEditor(
    {
      extensions: createTiptapExtensions(),
      content: editorDocumentToTiptapJson(parseMarkdown(markdown)),
      editorProps: {
        attributes: {
          class: "md-tiptap-editor",
          spellcheck: "true",
        },
      },
      onCreate: () => {
        suppressSyncRef.current = true;
        appliedMarkdownRef.current = markdown;
        lastSyncedRef.current = markdown;
        queueMicrotask(() => {
          suppressSyncRef.current = false;
        });
      },
      onUpdate: ({ editor: ed }) => {
        if (suppressSyncRef.current || !isEditorUsable(ed)) return;
        const next = readEditorMarkdown(ed);
        appliedMarkdownRef.current = next;
        syncContent(tab.documentId, next, lastSyncedRef);
      },
      onFocus: () => {
        tabStripApi?.scrollTabIntoViewIfNeeded(tab.id);
      },
    },
    [tab.documentId],
  );

  useEffect(() => {
    if (!isEditorUsable(editor)) return;
    if (markdown === appliedMarkdownRef.current) return;
    const current = readEditorMarkdown(editor);
    if (current === markdown) {
      appliedMarkdownRef.current = markdown;
      lastSyncedRef.current = markdown;
      return;
    }
    applyTiptapMarkdown(editor, markdown, lastSyncedRef, suppressSyncRef);
    appliedMarkdownRef.current = markdown;
  }, [editor, markdown, lastSyncedRef, suppressSyncRef]);

  useEffect(() => {
    if (!isEditorUsable(editor)) return;

    const handle: LiveSurfaceHandle = {
      mode: "live",
      flush() {
        if (!isEditorUsable(editor)) return null;
        const next = readEditorMarkdown(editor);
        syncContent(tab.documentId, next, lastSyncedRef);
        const current = getCore().document.get(tab.documentId);
        if (!current || next === current.content) return null;
        return { kind: "replace-all", content: next };
      },
      revealLine(line) {
        if (!isEditorUsable(editor)) return false;
        const next = readEditorMarkdown(editor);
        const offset = lineToCharOffset(next, line, 1);
        editor.commands.focus();
        editor.commands.setTextSelection(Math.min(offset, editor.state.doc.content.size - 1));
        const dom = editor.view.domAtPos(editor.state.selection.from);
        const node = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement;
        node?.scrollIntoView({ block: "center" });
        return true;
      },
      applyExternalContent(content) {
        if (!isEditorUsable(editor)) return;
        const current = readEditorMarkdown(editor);
        if (current === content) {
          lastSyncedRef.current = content;
          appliedMarkdownRef.current = content;
          return;
        }
        if (current !== lastSyncedRef.current) {
          syncContent(tab.documentId, current, lastSyncedRef);
          return;
        }
        applyTiptapMarkdown(editor, content, lastSyncedRef, suppressSyncRef);
        appliedMarkdownRef.current = content;
      },
      focus() {
        if (!isEditorUsable(editor)) return;
        editor.commands.focus();
      },
      captureViewState() {
        if (!isEditorUsable(editor)) return {};
        const next = readEditorMarkdown(editor);
        const blockId = getActiveBlockId(editor);
        const from = editor.state.selection.from;
        const anchor: ModeSwitchAnchor = blockId
          ? { blockId, offsetInBlock: editor.state.selection.$from.parentOffset }
          : locateAnchorInDocument(parseMarkdown(next), from);
        const pos = locateAnchorInMarkdown(next, anchor);
        return {
          cursor: { line: pos.line, column: pos.column },
          scroll: scrollRef.current
            ? { scrollTop: scrollRef.current.scrollTop }
            : undefined,
        };
      },
      restoreViewState(viewState) {
        if (!isEditorUsable(editor)) return;
        if (viewState.scroll && scrollRef.current) {
          scrollRef.current.scrollTop = viewState.scroll.scrollTop;
        }
        if (viewState.cursor) {
          const next = readEditorMarkdown(editor);
          const offset = lineToCharOffset(next, viewState.cursor.line, viewState.cursor.column);
          requestAnimationFrame(() => {
            if (!isEditorUsable(editor)) return;
            editor.commands.setTextSelection(
              Math.min(offset, editor.state.doc.content.size - 1),
            );
          });
        }
      },
    };

    onReady(handle);
    perfLog("editor.route-a.live.ready", { tabId: tab.id });

    return () => {
      if (!isEditorUsable(editor) || suppressSyncRef.current) return;
      const next = readEditorMarkdown(editor);
      syncContent(tab.documentId, next, lastSyncedRef);
    };
  }, [editor, lastSyncedRef, onReady, suppressSyncRef, tab.documentId, tab.id, tabStripApi]);

  if (!editor) return null;

  return (
    <div
      ref={scrollRef}
      className={`markdown-editor-surface markdown-editor-live h-full min-h-0 overflow-auto ${
        effective === "dark" ? "theme-dark" : ""
      }`}
    >
      <div className="markdown-editor-inner">
        <EditorContent editor={editor} />
        <TableBlockChrome editor={editor} />
        <BlockHoverActions editor={editor} />
      </div>
    </div>
  );
}

function SourceEditor({
  tab,
  markdown,
  lastSyncedRef,
  onReady,
}: {
  tab: EditorTab;
  markdown: string;
  lastSyncedRef: React.MutableRefObject<string>;
  onReady: (handle: LiveSurfaceHandle) => void;
}) {
  const effective = useThemeStore((s) => s.effective);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(markdown);
  const tabStripApi = useTabStripApi();

  useEffect(() => {
    setValue(markdown);
    lastSyncedRef.current = markdown;
  }, [markdown, lastSyncedRef]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handle: LiveSurfaceHandle = {
      mode: "source",
      flush() {
        syncContent(tab.documentId, textarea.value, lastSyncedRef);
        const current = getCore().document.get(tab.documentId);
        if (!current || textarea.value === current.content) return null;
        return { kind: "replace-all", content: textarea.value };
      },
      revealLine(line) {
        return revealSourceLine(textarea, line);
      },
      applyExternalContent(content) {
        if (textarea.value === content) {
          lastSyncedRef.current = content;
          return;
        }
        if (textarea.value !== lastSyncedRef.current) {
          syncContent(tab.documentId, textarea.value, lastSyncedRef);
          return;
        }
        lastSyncedRef.current = content;
        setValue(content);
      },
      focus() {
        textarea.focus();
      },
      captureViewState() {
        const start = textarea.selectionStart;
        const doc = parseMarkdown(textarea.value);
        const anchor = locateAnchorInDocument(doc, start);
        const pos = locateAnchorInMarkdown(textarea.value, anchor);
        return {
          cursor: { line: pos.line, column: pos.column },
          scroll: { scrollTop: textarea.scrollTop },
        };
      },
      restoreViewState(viewState) {
        if (viewState.scroll) textarea.scrollTop = viewState.scroll.scrollTop;
        if (viewState.cursor) {
          const offset = lineToCharOffset(
            textarea.value,
            viewState.cursor.line,
            viewState.cursor.column,
          );
          textarea.setSelectionRange(offset, offset);
        }
      },
    };

    onReady(handle);
    perfLog("editor.route-a.source.ready", { tabId: tab.id });
  }, [lastSyncedRef, onReady, tab.documentId, tab.id, value]);

  return (
    <div
      className={`markdown-editor-surface markdown-editor-source h-full min-h-0 ${
        effective === "dark" ? "theme-dark" : ""
      }`}
    >
      <textarea
        ref={textareaRef}
        className="markdown-source-textarea"
        value={value}
        spellCheck={false}
        onFocus={() => tabStripApi?.scrollTabIntoViewIfNeeded(tab.id)}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          syncContent(tab.documentId, next, lastSyncedRef);
        }}
        placeholder="Markdown 源码…"
      />
    </div>
  );
}

function EditorLoadingPlaceholder({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center text-text-secondary">
      <div className="text-center text-sm">正在加载 {name}…</div>
    </div>
  );
}

export function EditorSurface({ tab }: Props) {
  const mode = resolveSurfaceMode(tab);
  const doc = useDocumentRecord(tab.documentId);
  const markdown = resolveSurfaceContent(doc);
  const handleRef = useRef<LiveSurfaceHandle | null>(null);
  const [ready, setReady] = useState(false);
  const lastSyncedRef = useRef(markdown);
  const suppressSyncRef = useRef(true);

  useEffect(() => {
    recoverAccidentalEmptyDocument(tab.documentId);
  }, [tab.documentId]);

  useEffect(() => {
    if (doc?.contentLoaded) {
      lastSyncedRef.current = resolveSurfaceContent(doc);
      return;
    }
    void ensureDocumentContentLoaded(tab.documentId);
  }, [doc, tab.documentId]);

  useEffect(() => {
    lastSyncedRef.current = markdown;
  }, [markdown]);

  const onReady = useCallback((handle: LiveSurfaceHandle) => {
    handleRef.current = handle;
    setReady(true);
  }, []);

  useEffect(() => {
    setReady(false);
    handleRef.current = null;
  }, [mode, tab.documentId]);

  useEffect(() => {
    if (!ready || !handleRef.current) return;
    return getCore().editorHost.registerSurface(
      tab.id,
      tab.documentId,
      mode,
      handleRef.current,
    );
  }, [mode, ready, tab.documentId, tab.id]);

  useEffect(() => {
    const eventBus = getCore().eventBus;
    return eventBus.subscribe("document:changed", (event) => {
      if (event.documentId !== tab.documentId) return;
      const next = getCore().document.get(tab.documentId);
      if (!next?.contentLoaded) return;
      const content = resolveSurfaceContent(next);
      if (content === lastSyncedRef.current) return;
      handleRef.current?.applyExternalContent(content);
    });
  }, [tab.documentId]);

  if (doc && !doc.contentLoaded) {
    return <EditorLoadingPlaceholder name={tab.displayName} />;
  }

  if (mode === "source") {
    return (
      <SourceEditor
        key={`${tab.documentId}-source`}
        tab={tab}
        markdown={markdown}
        lastSyncedRef={lastSyncedRef}
        onReady={onReady}
      />
    );
  }

  return (
    <EditorSurfaceProvider documentPath={tab.path}>
      <LiveEditor
        key={`${tab.documentId}-live`}
        tab={tab}
        markdown={markdown}
        lastSyncedRef={lastSyncedRef}
        suppressSyncRef={suppressSyncRef}
        onReady={onReady}
      />
    </EditorSurfaceProvider>
  );
}
