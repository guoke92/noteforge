import { isTauri } from "@/ipc";
import { perfLog } from "@/lib/startup-perf";

/** Show the native window after the first UI frame is ready (Tauri only). */
export async function showAppWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.show();
    await win.setFocus();
    perfLog("app.window.shown");
  } catch (err) {
    console.warn("showAppWindow failed", err);
  }
}
