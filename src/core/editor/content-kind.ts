import type { DocumentRecord } from "../document/types";
import type { EditorTab } from "@/store/editor";
import { isMarkdownTab } from "@/lib/editor-doc";

/** High-level content routing for the editor surface registry (NFEP). */
export type ContentKind = "markdown" | "structured" | "code" | "plain";

export function resolveContentKind(
  tab: Pick<EditorTab, "language" | "kind" | "path">,
  _doc: Pick<DocumentRecord, "tier" | "contentLoaded" | "language">,
): ContentKind {
  if (isMarkdownTab(tab)) {
    return "markdown";
  }
  if (tab.language === "json" || tab.language === "yaml") {
    return "structured";
  }
  if (tab.language === "plaintext" || tab.language === "text") {
    return "plain";
  }
  return "code";
}
