import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { DocumentRecord } from "../document/types";
import type { EditorTab } from "@/store/editor";
import { resolveContentKind, type ContentKind } from "./content-kind";

export interface EditorSurfaceProps {
  tab: EditorTab;
  doc: DocumentRecord;
}

type SurfaceModule = { default: ComponentType<EditorSurfaceProps> };

function lazySurface(
  loader: () => Promise<SurfaceModule>,
): LazyExoticComponent<ComponentType<EditorSurfaceProps>> {
  return lazy(loader);
}

const SURFACES: Record<ContentKind, LazyExoticComponent<ComponentType<EditorSurfaceProps>>> = {
  markdown: lazySurface(() =>
    import("@/features/markdown/MarkdownPanel").then((m) => ({
      default: ({ tab }) => <m.MarkdownPanel tab={tab} />,
    })),
  ),
  structured: lazySurface(() =>
    import("@/components/editor/JsonYamlPanel").then((m) => ({
      default: ({ tab }) => <m.JsonYamlPanel tab={tab} />,
    })),
  ),
  code: lazySurface(() =>
    import("@/components/editor/MonacoCodeSurface").then((m) => ({
      default: ({ tab }) => <m.MonacoCodeSurface tab={tab} />,
    })),
  ),
  plain: lazySurface(() =>
    import("@/components/editor/MonacoCodeSurface").then((m) => ({
      default: ({ tab }) => <m.MonacoCodeSurface tab={tab} />,
    })),
  ),
};

export function resolveEditorSurface(
  tab: EditorTab,
  doc: DocumentRecord,
): LazyExoticComponent<ComponentType<EditorSurfaceProps>> {
  return SURFACES[resolveContentKind(tab, doc)];
}
