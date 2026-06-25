import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import type { EditorTab } from "@/store/editor";
import { useEditorStore } from "@/store/editor";
import { useThemeStore } from "@/store/theme";
import { getCore } from "@/core/runtime";
import type { EditorSurfaceMode } from "@/core/document/types";
import type { LiveSurfaceHandle } from "@/core/editor/surface-handle";
import { resolveSurfaceMode } from "@/lib/surface-mode";
import { perfLog } from "@/lib/startup-perf";
import { collectMarkdownNotes, resolveWikiTargetName } from "@/lib/wiki-resolve";
import { useWorkspaceStore } from "@/store/workspace";
import {
  captureEditorViewState,
  createMarkdownEditor,
  revealEditorLine,
  restoreEditorViewState,
  setEditorContent,
  setEditorLiveMode,
} from "./cm6/create-editor";
import { resolveMarkdownLinkPath } from "./cm6/resolve-link";
import { useTabStripApi } from "@/contexts/tab-strip-api";

interface Props {
  tab: EditorTab;
}

function openWikiTarget(label: string): void {
  const tree = useWorkspaceStore.getState().tree;
  const notes = collectMarkdownNotes(tree);
  const { path } = resolveWikiTargetName(label, notes);
  if (path) void useEditorStore.getState().openFile(path);
}

function openMarkdownLink(href: string, notePath: string | null): void {
  const resolved = resolveMarkdownLinkPath(notePath, href);
  const path = resolved.split("#")[0]!;
  if (path.endsWith(".md")) {
    void useEditorStore.getState().openFile(path);
  }
}

function syncEditorContentToDocument(
  documentId: string,
  content: string,
  lastSyncedRef: React.MutableRefObject<string>,
): void {
  if (content === lastSyncedRef.current) return;
  const doc = getCore().document.get(documentId);
  if (!doc || content === doc.content) {
    lastSyncedRef.current = content;
    return;
  }
  getCore().document.applyPatch(documentId, { kind: "replace-all", content });
  lastSyncedRef.current = content;
}

function buildHandle(
  view: EditorView,
  tab: EditorTab,
  mode: EditorSurfaceMode,
  lastSyncedRef: React.MutableRefObject<string>,
): LiveSurfaceHandle {
  return {
    mode,
    flush() {
      const markdown = view.state.doc.toString();
      syncEditorContentToDocument(tab.documentId, markdown, lastSyncedRef);
      const current = getCore().document.get(tab.documentId);
      if (!current || markdown === current.content) return null;
      return { kind: "replace-all", content: markdown };
    },
    revealLine(line) {
      return revealEditorLine(view, line);
    },
    applyExternalContent(content) {
      const editorText = view.state.doc.toString();
      if (editorText === content) {
        lastSyncedRef.current = content;
        return;
      }
      // Never stomp uncommitted editor text (e.g. stale document:changed echo).
      if (editorText !== lastSyncedRef.current) {
        syncEditorContentToDocument(tab.documentId, editorText, lastSyncedRef);
        return;
      }
      lastSyncedRef.current = content;
      setEditorContent(view, content);
    },
    focus() {
      view.focus();
    },
    captureViewState() {
      return captureEditorViewState(view);
    },
    restoreViewState(state) {
      restoreEditorViewState(view, state);
    },
  };
}

export function MarkdownHybridSurface({ tab }: Props) {
  const effective = useThemeStore((s) => s.effective);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const handleRef = useRef<LiveSurfaceHandle | null>(null);
  const lastSyncedRef = useRef("");
  const tabIdRef = useRef(tab.id);
  const documentIdRef = useRef(tab.documentId);
  tabIdRef.current = tab.id;
  documentIdRef.current = tab.documentId;

  const mode = resolveSurfaceMode(tab);
  const [viewReady, setViewReady] = useState(false);
  const tabStripApi = useTabStripApi();
  const tabStripScrollRef = useRef(tabStripApi);
  tabStripScrollRef.current = tabStripApi;

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    setViewReady(false);
    const doc = getCore().document.get(tab.documentId);
    const initialContent = doc?.content ?? "";
    lastSyncedRef.current = initialContent;
    const initialMode = resolveSurfaceMode(tab);
    const notePath = doc?.vaultPath ?? tab.path ?? null;

    const view = createMarkdownEditor({
      parent,
      content: initialContent,
      live: initialMode === "live",
      dark: effective === "dark",
      vaultPath: notePath,
      placeholderText: "开始写作…",
      onEditorFocus: () => {
        tabStripScrollRef.current?.scrollTabIntoViewIfNeeded(tabIdRef.current);
      },
      onChange: (md) => {
        syncEditorContentToDocument(documentIdRef.current, md, lastSyncedRef);
      },
      onCaretChange: (status) => {
        useEditorStore.getState().reportCaretStatus(tabIdRef.current, status);
      },
      onWikiLinkClick: openWikiTarget,
      onMarkdownLinkClick: (href) => {
        openMarkdownLink(href, notePath);
      },
    });

    viewRef.current = view;

    if (doc?.viewState) {
      requestAnimationFrame(() => {
        if (viewRef.current !== view) return;
        restoreEditorViewState(view, {
          cursor: doc.viewState!.cursor,
          scroll: doc.viewState!.scroll,
        });
      });
    }

    handleRef.current = buildHandle(view, tab, initialMode, lastSyncedRef);

    perfLog("editor.cm6.ready", { tabId: tab.id, mode: initialMode });
    setViewReady(true);

    return () => {
      setViewReady(false);
      const markdown = view.state.doc.toString();
      syncEditorContentToDocument(tab.documentId, markdown, lastSyncedRef);
      view.destroy();
      parent.replaceChildren();
      viewRef.current = null;
      handleRef.current = null;
    };
  }, [tab.id, tab.documentId, effective]);

  useEffect(() => {
    if (!viewReady) return;
    const view = viewRef.current;
    const handle = handleRef.current;
    if (!view || !handle) return;

    handle.mode = mode;
    setEditorLiveMode(view, mode === "live");

    return getCore().editorHost.registerSurface(tab.id, tab.documentId, mode, handle);
  }, [viewReady, tab.id, tab.documentId, mode]);

  useEffect(() => {
    const eventBus = getCore().eventBus;
    return eventBus.subscribe("document:changed", (event) => {
      if (event.documentId !== tab.documentId) return;
      const doc = getCore().document.get(tab.documentId);
      if (!doc?.contentLoaded) return;

      const view = viewRef.current;
      if (!view) return;

      const editorText = view.state.doc.toString();
      if (editorText === doc.content) {
        lastSyncedRef.current = doc.content;
        return;
      }

      // Editor is ahead of DocumentService — push local truth instead of pulling stale buffer.
      if (editorText !== lastSyncedRef.current) {
        syncEditorContentToDocument(tab.documentId, editorText, lastSyncedRef);
        return;
      }

      handleRef.current?.applyExternalContent(doc.content);
    });
  }, [tab.documentId]);

  return (
    <div
      ref={containerRef}
      className={`markdown-hybrid-surface h-full min-h-0 overflow-hidden ${
        effective === "dark" ? "theme-dark" : ""
      }`}
    />
  );
}
