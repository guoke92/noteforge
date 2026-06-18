import { scratch } from "@/ipc";
import type { DocumentService } from "../document/service";
import type { PersistedTabRef } from "../workbench/types";
import { DEFAULT_PREFERENCES } from "../platform/config";

export interface ScratchRestoreResult {
  title: string;
  content: string;
  viewState: NonNullable<PersistedTabRef["viewState"]>;
  scratchId?: string;
}

/** Load scratch buffer + ephemeral metadata for session restore / deferred hydration. */
export async function loadScratchRestoreData(
  tabRef: PersistedTabRef,
): Promise<ScratchRestoreResult> {
  let title = tabRef.ephemeral?.title ?? "Untitled";
  let content = tabRef.ephemeral?.content ?? "";
  const viewState =
    tabRef.viewState ??
    tabRef.ephemeral?.viewState ?? {
      mode: DEFAULT_PREFERENCES.editor.defaultSurfaceMode,
    };

  const scratchId = tabRef.scratchId;
  if (scratchId) {
    try {
      const buf = await scratch.loadBuffer(scratchId);
      if (buf) {
        title = buf.displayName;
        content = buf.content;
      }
    } catch {
      /* use ephemeral fallback */
    }
  }

  return { title, content, viewState, scratchId };
}

export function createEphemeralFromScratchRestore(
  document: DocumentService,
  paneId: string,
  data: ScratchRestoreResult,
) {
  const doc = document.createEphemeral({
    ...(data.scratchId ? { id: data.scratchId } : {}),
    paneId,
    title: data.title,
    content: data.content,
    initialMode: data.viewState.mode,
  });
  document.updateViewState(doc.id, data.viewState);
  return doc;
}
