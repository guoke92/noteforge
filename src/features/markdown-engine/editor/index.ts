/**
 * Route A architecture contracts (frozen interfaces).
 * L2 Codec → L3 EditorDocument → L4 EditorSurface + commands/queries.
 */
export type {
  EditorDocument,
  EditorBlock,
  EditorBlockModel,
  EditorSegment,
  ModeSwitchAnchor,
  UnknownBlockModel,
} from "./schema";

export { parseMarkdown, serializeMarkdown } from "../codec";
export { toggleHeading, insertTable, deleteBlockAtSelection, setParagraph } from "./commands";
export { isHeadingActive, getCurrentBlockType, getActiveBlockId } from "./queries";
