import type { EditorTab } from "@/store/editor";
import { isTauri } from "@/ipc";
import { extensionForSave, suggestedSaveFileName } from "@/lib/editor-doc";

async function defaultSaveDirectory(workspacePath?: string | null): Promise<string> {
  if (workspacePath) {
    return workspacePath.replace(/\/$/, "");
  }
  if (isTauri()) {
    const { documentDir, homeDir } = await import("@tauri-apps/api/path");
    const docs = await documentDir().catch(() => null);
    if (docs) return docs.replace(/\/$/, "");
    const home = await homeDir().catch(() => null);
    if (home) return home.replace(/\/$/, "");
  }
  return "";
}

/**
 * Native save dialog (Tauri). Returns absolute path or null if cancelled.
 */
export async function pickSaveFilePath(
  tab: EditorTab,
  workspacePath?: string | null,
): Promise<string | null> {
  if (!isTauri()) return null;

  const { getCore } = await import("@/core/runtime");
  const content = getCore().document.get(tab.documentId)?.content ?? "";

  const { save } = await import("@tauri-apps/plugin-dialog");
  const dir = await defaultSaveDirectory(workspacePath);
  const fileName = suggestedSaveFileName(tab, content);
  const ext = extensionForSave(content);
  const defaultPath = dir ? `${dir}/${fileName}` : fileName;

  return save({
    defaultPath,
    filters: [
      { name: ext.toUpperCase(), extensions: [ext] },
      { name: "All files", extensions: ["*"] },
    ],
  });
}

export async function promptSaveScratchTab(
  tabId: string,
  workspacePath: string | null | undefined,
  saveTabAs: (id: string, path: string) => Promise<void>,
  openFallbackDialog: (id: string) => void,
): Promise<void> {
  const { useEditorStore } = await import("@/store/editor");
  const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab || tab.kind !== "scratch") return;

  if (isTauri()) {
    const path = await pickSaveFilePath(tab, workspacePath);
    if (path) await saveTabAs(tabId, path);
    return;
  }
  openFallbackDialog(tabId);
}
