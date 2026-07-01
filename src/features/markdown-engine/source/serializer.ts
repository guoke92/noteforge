import { serializeBlockModel } from "../blocks/registry";
import type { BlockChunk, SourceDocument } from "./types";
import { hashRaw } from "./hash";

export function serializeSourceDocument(doc: SourceDocument): string {
  return doc.chunks
    .map((chunk) => {
      if (chunk.kind === "space" || chunk.kind === "raw") return chunk.raw;
      if (!chunk.dirty) return chunk.raw;
      return serializeBlockModel(chunk.model);
    })
    .join("");
}

export function commitSerializedBlock(chunk: BlockChunk): BlockChunk {
  const raw = serializeBlockModel(chunk.model);
  return {
    ...chunk,
    raw,
    baselineModel: JSON.parse(JSON.stringify(chunk.model)),
    dirty: false,
    meta: {
      ...chunk.meta,
      sourceHash: hashRaw(raw),
      version: chunk.meta.version + 1,
    },
  };
}

export function commitDirtyChunks(doc: SourceDocument): SourceDocument {
  let changed = false;
  const chunks = doc.chunks.map((chunk) => {
    if (chunk.kind !== "block" || !chunk.dirty) return chunk;
    changed = true;
    return commitSerializedBlock(chunk);
  });

  if (!changed) return doc;
  return {
    ...doc,
    version: doc.version + 1,
    chunks,
  };
}

export function updateChunkInDocument(
  doc: SourceDocument,
  blockId: string,
  updater: (chunk: BlockChunk) => BlockChunk,
): SourceDocument {
  return {
    ...doc,
    version: doc.version + 1,
    chunks: doc.chunks.map((chunk) => {
      if (chunk.kind !== "block" || chunk.id !== blockId) return chunk;
      return updater(chunk);
    }),
  };
}
