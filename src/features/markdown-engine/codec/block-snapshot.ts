import type { EditorDocument } from "../editor/schema";

export type BlockSnapshot = Record<string, string>;

export type BlockSnapshotPolicy = {
  onLoad(text: string): { doc: EditorDocument; snapshot: BlockSnapshot | null };
  onSave(doc: EditorDocument, snapshot: BlockSnapshot | null): string;
};

/** Default no-op — snapshot disabled until git-diff noise becomes a product pain. */
export const noopBlockSnapshotPolicy: BlockSnapshotPolicy = {
  onLoad(_text) {
    return { doc: { version: 1, segments: [] }, snapshot: null };
  },
  onSave(_doc, _snapshot) {
    return "";
  },
};
