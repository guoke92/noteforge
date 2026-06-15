import { DEFAULT_PREFERENCES } from "../platform/config";
import { getCore, openDocumentInPane } from "../runtime";
import { useEditorStore } from "@/store/editor";
import { useWorkspaceStore } from "@/store/workspace";
import { fs } from "@/ipc";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format daily note filename from config pattern (supports YYYY, MM, DD). */
export function formatDailyNoteDate(format: string, date = new Date()): string {
  return format
    .replace(/YYYY/g, String(date.getFullYear()))
    .replace(/MM/g, pad2(date.getMonth() + 1))
    .replace(/DD/g, pad2(date.getDate()));
}

export async function openDailyNote(): Promise<void> {
  const vault = getCore().vault.getCurrent();
  if (!vault) {
    window.alert("请先打开知识库");
    return;
  }

  const { dailyNoteDirectory, dailyNoteFormat } = DEFAULT_PREFERENCES.editor;
  const dateStr = formatDailyNoteDate(dailyNoteFormat);
  const dir = `${vault.rootPath.replace(/\/$/, "")}/${dailyNoteDirectory}`;
  const path = `${dir}/${dateStr}.md`;
  const paneId = useEditorStore.getState().activePaneId;

  try {
    await fs.read(path);
  } catch {
    try {
      await fs.create(path, `# ${dateStr}\n\n`);
      await useWorkspaceStore.getState().refreshTree();
    } catch (e) {
      console.error("create daily note failed", e);
      window.alert(`无法创建日记：${path}`);
      return;
    }
  }

  await openDocumentInPane(path, paneId);
}
