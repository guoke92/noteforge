/**
 * Per-tab lifecycle: capture view state (cursor/scroll/mode) and scratch autosave on deactivate.
 */
import { getCore } from "@/core/runtime";
import { resolveSurfaceMode } from "@/lib/surface-mode";
import { useEditorStore, isDirty } from "@/store/editor";
import { flushScratchBuffer } from "./scratch-autosave";

/** Called when leaving a tab (switch away, close pane, app exit snapshot). */
export function deactivateTab(tabId: string): void {
  const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return;

  const core = getCore();
  core.editorHost.flushSurface(tabId, resolveSurfaceMode(tab));

  if (tab.kind === "scratch" && tab.scratchId && isDirty(tab)) {
    void flushScratchBuffer(tab.scratchId);
  }
}

/** Snapshot cursor/scroll for every open tab before persisting window session. */
export function captureAllOpenTabViewStates(): void {
  const core = getCore();
  for (const tab of useEditorStore.getState().tabs) {
    core.editorHost.flushSurface(tab.id, resolveSurfaceMode(tab));
  }
}
