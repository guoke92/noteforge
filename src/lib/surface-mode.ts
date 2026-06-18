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

/** Order used when cycling write → read → source (TabBar / keyboard). */
export const SURFACE_MODE_CYCLE_ORDER: readonly SurfaceMode[] = ["write", "read", "source"];

export function nextSurfaceMode(current: SurfaceMode): SurfaceMode {
  const idx = SURFACE_MODE_CYCLE_ORDER.indexOf(current);
  return SURFACE_MODE_CYCLE_ORDER[(idx + 1) % SURFACE_MODE_CYCLE_ORDER.length]!;
}
