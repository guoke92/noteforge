import { useEffect } from "react";
import type { EditorTab } from "@/store/editor";
import { useEditorStore } from "@/store/editor";
import { resolveSurfaceMode, isReadOnlySurface } from "@/lib/surface-mode";
import { MonacoEditor } from "@/components/editor/MonacoEditor";
import { MilkdownSurface } from "./MilkdownSurface";
import { getCore } from "@/core/runtime";

interface Props {
  tab: EditorTab;
}

/**
 * Markdown surfaces (ADR-005):
 * - write: Milkdown WYSIWYG
 * - read:  Milkdown readOnly (same adapter)
 * - source: Monaco
 */
export function MarkdownPanel({ tab }: Props) {
  const revealLineRequest = useEditorStore((s) => s.revealLineRequest);
  const consumeRevealLine = useEditorStore((s) => s.consumeRevealLine);
  const mode = resolveSurfaceMode(tab);
  const readOnly = isReadOnlySurface(mode);

  useEffect(() => {
    if (!revealLineRequest || revealLineRequest.tabId !== tab.id) return;

    const line = revealLineRequest.line;
    const attempt = () => getCore().editorHost.revealLine(tab.id, line);

    if (attempt()) {
      consumeRevealLine();
      return;
    }

    const raf = requestAnimationFrame(() => {
      if (attempt()) consumeRevealLine();
    });
    return () => cancelAnimationFrame(raf);
  }, [revealLineRequest, tab.id, consumeRevealLine]);

  if (mode === "source") {
    return (
      <MonacoEditor
        tab={tab}
        markdownVariant="source"
        hostSurfaceMode="source"
      />
    );
  }

  return (
    <MilkdownSurface
      tab={tab}
      mode={mode}
      readOnly={readOnly}
    />
  );
}
