import type { BlockModel, BlockType } from "../blocks/types";

export type SpaceChunk = {
  kind: "space";
  raw: string;
};

export type RawChunk = {
  kind: "raw";
  raw: string;
  reason: "frontmatter" | "html" | "code_fence" | "blockquote" | "list" | "image" | "hr" | "unknown";
};

export type BlockChunk<T extends BlockModel = BlockModel> = {
  kind: "block";
  id: string;
  blockType: BlockType;
  raw: string;
  model: T;
  baselineModel: T;
  dirty: boolean;
  meta: {
    sourceHash: string;
    version: number;
  };
};

export type SourceChunk = SpaceChunk | RawChunk | BlockChunk;

export type SourceDocument = {
  version: number;
  chunks: SourceChunk[];
};
