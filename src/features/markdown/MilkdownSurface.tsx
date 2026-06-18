import { useEffect, useRef } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { EditorStatus, editorViewCtx } from "@milkdown/kit/core";
import { replaceAll } from "@milkdown/kit/utils";
import type { EditorTab } from "@/store/editor";
import { useEditorStore } from "@/store/editor";
import { useThemeStore } from "@/store/theme";
import { getCore } from "@/core/runtime";
import type { EditorSurfaceMode } from "@/core/document/types";
import type { LiveSurfaceHandle } from "@/core/editor/surface-handle";
import { revealHeadingInCrepe } from "./heading-nav";
import { wikiLinkPlugins } from "./wikilink-plugin";
import { createCaretStatusPlugin } from "./caret-status-plugin";
import { createContentDebouncer } from "@/core/editor/content-debouncer";
import { MILKDOWN_READONLY_POLL_MS } from "@/core/platform/timing";
import { perfLog } from "@/lib/startup-perf";

interface Props {
  tab: EditorTab;
  mode: Extract<EditorSurfaceMode, "write" | "read">;
  readOnly: boolean;
}

function MilkdownEditorInner({ tab, mode, readOnly }: Props) {
  const updateContent = useEditorStore((s) => s.updateContent);
  const crepeRef = useRef<Crepe | null>(null);
  const initialContent = getCore().document.get(tab.documentId)?.content ?? "";
  const lastEmittedRef = useRef(initialContent);
  const suppressEmitRef = useRef(false);
  const handleRef = useRef<LiveSurfaceHandle | null>(null);
  const tabIdRef = useRef(tab.id);
  const documentIdRef = useRef(tab.documentId);
  tabIdRef.current = tab.id;
  documentIdRef.current = tab.documentId;

  const contentDebouncerRef = useRef(
    createContentDebouncer({
      shouldEmit(markdown) {
        if (markdown === lastEmittedRef.current) return false;
        const doc = getCore().document.get(documentIdRef.current);
        return !!doc && markdown !== doc.content;
      },
      onEmit(markdown) {
        lastEmittedRef.current = markdown;
        updateContent(tabIdRef.current, markdown);
      },
    }),
  );

  const flushPendingMarkdown = () => {
    contentDebouncerRef.current.flushPending();
  };

  const scheduleMarkdownUpdate = (markdown: string) => {
    contentDebouncerRef.current.schedule(markdown);
  };

  const { loading } = useEditor(
    (root) => {
      const crepe = new Crepe({
        root,
        defaultValue: initialContent,
        featureConfigs: {
          [CrepeFeature.Placeholder]: {
            text: readOnly ? "" : "开始写作，输入 / 唤起命令…",
            mode: "block",
          },
        },
      });

      for (const plugin of wikiLinkPlugins) {
        crepe.editor.use(plugin);
      }
      crepe.editor.use(createCaretStatusPlugin(tab.id));

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (suppressEmitRef.current || readOnly) return;
          if (markdown === lastEmittedRef.current) return;
          scheduleMarkdownUpdate(markdown);
        });
      });

      crepeRef.current = crepe;
      return crepe;
    },
    [tab.id],
  );

  handleRef.current = {
    mode,
    flush() {
      const crepe = crepeRef.current;
      if (!crepe || readOnly) return null;

      contentDebouncerRef.current.flushPending();

      const markdown = crepe.getMarkdown();
      const doc = getCore().document.get(tab.documentId);
      if (!doc || markdown === doc.content) return null;
      lastEmittedRef.current = markdown;
      return { kind: "replace-all", content: markdown };
    },
    revealLine(line: number) {
      const crepe = crepeRef.current;
      if (!crepe) return false;
      const doc = getCore().document.get(tab.documentId);
      return revealHeadingInCrepe(crepe, doc?.content ?? "", line);
    },
    applyExternalContent(content: string) {
      const crepe = crepeRef.current;
      if (!crepe || crepe.editor.status !== EditorStatus.Created) return;
      if (crepe.getMarkdown() === content) {
        lastEmittedRef.current = content;
        return;
      }
      contentDebouncerRef.current.cancel();
      suppressEmitRef.current = true;
      lastEmittedRef.current = content;
      crepe.editor.action(replaceAll(content, false));
      queueMicrotask(() => {
        suppressEmitRef.current = false;
      });
    },
    focus() {
      const crepe = crepeRef.current;
      if (!crepe || crepe.editor.status !== EditorStatus.Created) return;
      crepe.editor.action((ctx) => {
        ctx.get(editorViewCtx).focus();
      });
    },
    captureViewState() {
      const crepe = crepeRef.current;
      if (!crepe || crepe.editor.status !== EditorStatus.Created) return {};
      let scrollTop = 0;
      crepe.editor.action((ctx) => {
        scrollTop = ctx.get(editorViewCtx).dom.scrollTop;
      });
      return { scroll: { scrollTop } };
    },
    restoreViewState(state) {
      if (state.scroll == null) return;
      const crepe = crepeRef.current;
      if (!crepe || crepe.editor.status !== EditorStatus.Created) return;
      crepe.editor.action((ctx) => {
        ctx.get(editorViewCtx).dom.scrollTop = state.scroll!.scrollTop;
      });
    },
  };

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    return getCore().editorHost.registerSurface(tab.id, tab.documentId, mode, handle);
  }, [tab.id, tab.documentId, mode, loading]);

  useEffect(() => {
    return () => {
      contentDebouncerRef.current.cancel();
      flushPendingMarkdown();
    };
  }, [tab.id, tab.documentId]);

  useEffect(() => {
    if (!loading) {
      perfLog("editor.milkdown.ready", { tabId: tab.id, mode, readOnly });
    }
  }, [loading, tab.id, mode, readOnly]);

  useEffect(() => {
    const eventBus = getCore().eventBus;
    return eventBus.subscribe("document:changed", (event) => {
      if (event.documentId !== tab.documentId) return;
      const doc = getCore().document.get(tab.documentId);
      if (!doc) return;
      const handle = handleRef.current;
      handle?.applyExternalContent(doc.content);
    });
  }, [tab.id, tab.documentId]);

  useEffect(() => {
    const crepe = crepeRef.current;
    if (!crepe) return;

    const applyReadonly = () => {
      if (crepe.editor.status === EditorStatus.Created) {
        crepe.setReadonly(readOnly);
        return true;
      }
      return false;
    };

    if (applyReadonly()) return;

    const timer = window.setInterval(() => {
      if (applyReadonly()) clearInterval(timer);
    }, MILKDOWN_READONLY_POLL_MS);
    return () => clearInterval(timer);
  }, [readOnly, loading]);

  return (
    <div
      className={`milkdown-surface h-full min-h-0 ${readOnly ? "milkdown-surface--readonly" : ""}`}
      data-readonly={readOnly ? "true" : "false"}
    >
      <Milkdown />
    </div>
  );
}

export function MilkdownSurface({ tab, mode, readOnly }: Props) {
  const effective = useThemeStore((s) => s.effective);

  return (
    <div className={effective === "dark" ? "theme-dark h-full min-h-0" : "h-full min-h-0"}>
      <MilkdownProvider key={tab.id}>
        <MilkdownEditorInner tab={tab} mode={mode} readOnly={readOnly} />
      </MilkdownProvider>
    </div>
  );
}
