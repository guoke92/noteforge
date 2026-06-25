import type { EditorSurfaceMode } from "@/core/document/types";
import type { EditorTab } from "@/store/editor";
import { normalizeSurfaceMode } from "@/core/workbench/types";

/** UI surface mode — aligned with DocumentService.viewState.mode (NFEP). */
export type SurfaceMode = EditorSurfaceMode;

/** Resolve tab surface mode; session legacy strings normalized on restore. */
export function resolveSurfaceMode(tab: Pick<EditorTab, "surfaceMode">): SurfaceMode {
  return normalizeSurfaceMode(tab.surfaceMode);
}

export function surfaceModeLabel(mode: SurfaceMode): string {
  switch (mode) {
    case "live":
      return "写作";
    case "source":
      return "源码";
  }
}

/** Order used when cycling live ↔ source (TabBar / keyboard). */
export const SURFACE_MODE_CYCLE_ORDER: readonly SurfaceMode[] = ["live", "source"];

export function nextSurfaceMode(current: SurfaceMode): SurfaceMode {
  const idx = SURFACE_MODE_CYCLE_ORDER.indexOf(current);
  return SURFACE_MODE_CYCLE_ORDER[(idx + 1) % SURFACE_MODE_CYCLE_ORDER.length]!;
}
