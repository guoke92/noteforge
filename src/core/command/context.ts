import { useEditorStore, type EditorTab } from "@/store/editor";
import { isMarkdownTab } from "@/lib/editor-doc";
import { getCore } from "@/core/runtime";
import type { CommandContext } from "./types";

export function buildCommandContext(): CommandContext {
  const editor = useEditorStore.getState();
  const activeDocumentId = editor.activeTabIdByPane[editor.activePaneId] ?? null;
  const activeTab: EditorTab | undefined = activeDocumentId
    ? editor.tabs.find((t) => t.id === activeDocumentId)
    : undefined;

  const target = (typeof document !== "undefined" ? document.activeElement : null) as
    | HTMLElement
    | null;
  const isInputContext =
    target?.tagName === "INPUT" ||
    target?.tagName === "TEXTAREA" ||
    target?.isContentEditable === true;
  const isEditorFocused = !!target?.closest(".monaco-editor") || !!target?.isContentEditable;

  let surfaceMode: CommandContext["surfaceMode"] = null;
  if (activeDocumentId) {
    const doc = getCore().document.get(activeDocumentId);
    if (doc) surfaceMode = doc.viewState.mode;
  }

  return {
    activeDocumentId,
    activePaneId: editor.activePaneId,
    activeTab,
    isEditorFocused,
    isInputContext,
    isMarkdownActive: !!activeTab && isMarkdownTab(activeTab),
    hasActiveTab: !!activeTab,
    surfaceMode,
  };
}
