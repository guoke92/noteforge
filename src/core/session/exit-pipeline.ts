import { cancelPendingScratchAutosave, flushAllDirtyScratchBuffers } from "./scratch-autosave";
import { captureAllOpenTabViewStates } from "./tab-lifecycle";
import { flushCoreBeforeExit } from "../runtime";

export async function runExitFlushPipeline(persistSession: () => Promise<void>): Promise<void> {
  captureAllOpenTabViewStates();
  cancelPendingScratchAutosave();
  const { cancelPendingWorkspaceDraftAutosave } = await import("./workspace-draft-autosave");
  cancelPendingWorkspaceDraftAutosave();
  await flushCoreBeforeExit();
  await flushAllDirtyScratchBuffers();
  await persistSession();
}
