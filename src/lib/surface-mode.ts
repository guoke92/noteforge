import type { EditorSurfaceMode } from "@/core/document/types";
import type { EditorTab } from "@/store/editor";
import { normalizeSurfaceMode } from "@/core/workbench/types";

/** UI surface mode — aligned with DocumentService.viewState.mode (ADR-005). */
export type SurfaceMode = EditorSurfaceMode;

/** Resolve tab surface mode; session legacy strings normalized on restore. */
export function resolveSurfaceMode(tab: Pick<EditorTab, "surfaceMode">): SurfaceMode {
  return normalizeSurfaceMode(tab.surfaceMode);
}

export function surfaceModeLabel(mode: SurfaceMode): string {
  switch (mode) {
    case "write":
      return "写作";
    case "source":
      return "源码";
    case "read":
      return "阅读";
  }
}

export function isReadOnlySurface(mode: SurfaceMode): boolean {
  return mode === "read";
}
