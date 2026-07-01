import type { BlockModel } from "../blocks/types";

/** Unparseable or preserved raw markdown (frontmatter, HTML, etc.). */
export type UnknownBlockModel = {
  type: "unknown";
  raw: string;
};

export type EditorBlockModel = BlockModel | UnknownBlockModel;

export function isUnknownBlock(model: EditorBlockModel): model is UnknownBlockModel {
  return model.type === "unknown";
}

export type EditorBlock = {
  id: string;
  model: EditorBlockModel;
};

export type EditorSegment =
  | { kind: "raw"; raw: string }
  | { kind: "block"; block: EditorBlock };

/** Route A runtime document — single truth source (L3). */
export type EditorDocument = {
  version: number;
  segments: EditorSegment[];
};

export type ModeSwitchAnchor = {
  blockId: string;
  offsetInBlock: number;
  scrollRatio?: number;
};
