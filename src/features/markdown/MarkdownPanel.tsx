import { useEffect } from "react";
import type { EditorTab } from "@/store/editor";
import { useEditorStore } from "@/store/editor";
import { getCore } from "@/core/runtime";
import { EditorSurface } from "@/features/markdown-engine/editor/EditorSurface";

interface Props {
  tab: EditorTab;
}

/**
 * Markdown surface — Route A single EditorSurface (live WYSIWYG + source).
 */
export function MarkdownPanel({ tab }: Props) {
  const revealLineRequest = useEditorStore((s) => s.revealLineRequest);
  const consumeRevealLine = useEditorStore((s) => s.consumeRevealLine);

  useEffect(() => {
    if (!revealLineRequest || revealLineRequest.tabId !== tab.id) return;

    const line = revealLineRequest.line;
    const attempt = () => getCore().editorHost.revealLine(tab.documentId, line);

    if (attempt()) {
      consumeRevealLine();
      return;
    }

    const raf = requestAnimationFrame(() => {
      if (attempt()) consumeRevealLine();
    });
    return () => cancelAnimationFrame(raf);
  }, [revealLineRequest, tab.id, tab.documentId, consumeRevealLine]);

  return <EditorSurface tab={tab} />;
}
