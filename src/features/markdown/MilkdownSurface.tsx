import { useEffect, useMemo, useRef } from "react";
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
import "./milkdown-surface.css";

interface Props {
  tab: EditorTab;
  mode: Extract<EditorSurfaceMode, "write" | "read">;
  readOnly: boolean;
}

function MilkdownEditorInner({ tab, mode, readOnly }: Props) {
  const updateContent = useEditorStore((s) => s.updateContent);
  const crepeRef = useRef<Crepe | null>(null);
  const lastEmittedRef = useRef(tab.content);
  const suppressEmitRef = useRef(false);
  const handleRef = useRef<LiveSurfaceHandle | null>(null);

  const { loading } = useEditor(
    (root) => {
      const crepe = new Crepe({
        root,
        defaultValue: tab.content,
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
          lastEmittedRef.current = markdown;
          updateContent(tab.id, markdown);
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
      const markdown = crepe.getMarkdown();
      const doc = getCore().document.get(tab.id);
      if (!doc || markdown === doc.content) return null;
      lastEmittedRef.current = markdown;
      return { kind: "replace-all", content: markdown };
    },
    revealLine(line: number) {
      const crepe = crepeRef.current;
      if (!crepe) return false;
      const doc = getCore().document.get(tab.id);
      return revealHeadingInCrepe(crepe, doc?.content ?? tab.content, line);
    },
    applyExternalContent(content: string) {
      const crepe = crepeRef.current;
      if (!crepe || crepe.editor.status !== EditorStatus.Created) return;
      if (crepe.getMarkdown() === content) {
        lastEmittedRef.current = content;
        return;
      }
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
    return getCore().editorHost.registerSurface(tab.id, mode, handle);
  }, [tab.id, mode, loading]);

  useEffect(() => {
    lastEmittedRef.current = tab.content;
  }, [tab.id]);

  useEffect(() => {
    if (!loading) {
      getCore().editorHost.applyExternalContent(tab.id, tab.content);
    }
  }, [tab.content, tab.id, loading]);

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
    }, 30);
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
