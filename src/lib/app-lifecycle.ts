import { isTauri } from "@/ipc";
import { useEditorStore } from "@/store/editor";

let lifecycleInstalled = false;

/**
 * App exit / window close.
 *
 * - Scratch buffers: autosaved to Layer A (scratch/buffers).
 * - Workspace drafts: autosaved to Layer A (drafts/), not written to disk until manual save.
 * - Window session: tab list, layout, viewState (Layer B).
 */
export function installAppLifecycle(): void {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;

  if (!isTauri()) return;

  void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
    const win = getCurrentWindow();
    await win.onCloseRequested(async (event) => {
      const allowed = await useEditorStore.getState().requestAppExit();
      if (!allowed) {
        event.preventDefault();
      }
    });
  }).catch((err) => {
    console.warn("Tauri close lifecycle unavailable", err);
  });
}
