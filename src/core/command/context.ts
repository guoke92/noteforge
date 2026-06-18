import { useEditorStore, type EditorTab } from "@/store/editor";
import { isMarkdownTab } from "@/lib/editor-doc";
import { getCore } from "@/core/runtime";
import type { CommandContext } from "./types";

export function buildCommandContext(): CommandContext {
  const editor = useEditorStore.getState();
  const activeTabId = editor.activeTabIdByPane[editor.activePaneId] ?? null;
  const activeTab: EditorTab | undefined = activeTabId
    ? editor.tabs.find((t) => t.id === activeTabId)
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
  if (activeTab) {
    const doc = getCore().document.get(activeTab.documentId);
    if (doc) surfaceMode = doc.viewState.mode;
  }

  return {
    activeTabId,
    activePaneId: editor.activePaneId,
    activeTab,
    isEditorFocused,
    isInputContext,
    isMarkdownActive: !!activeTab && isMarkdownTab(activeTab),
    hasActiveTab: !!activeTab,
    surfaceMode,
  };
}
