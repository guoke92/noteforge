export {
  markdownLanguageService,
  type MarkdownDoc,
  type OutlineNode,
  type WikiLinkRef,
} from "./language-service";

export { EditorSurface } from "./editor/EditorSurface";
export { parseMarkdown, serializeMarkdown } from "./codec";
export type { EditorDocument, EditorBlock, ModeSwitchAnchor } from "./editor/schema";
