import {
  ChevronDown,
  PanelLeft,
  PanelRight,
  Save,
  Search,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspace";
import { useUIStore } from "@/store/ui";
import { useEditorStore } from "@/store/editor";
import { openSaveAsDialog } from "@/core/dialog/dialog-api";
import { useThemeStore } from "@/store/theme";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { promptSaveScratchTab } from "@/lib/save-dialog";
import { isScratchTab } from "@/lib/editor-doc";
import { MOD_LABEL, SHIFT_LABEL } from "@/hooks/useShortcuts";

export function TopBar() {
  const ws = useWorkspaceStore((s) => s.current);
  const recent = useWorkspaceStore((s) => s.recent);
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const rightOpen = useUIStore((s) => s.rightOpen);
  const setRightOpen = useUIStore((s) => s.setRightOpen);
  const setGlobalSearchOpen = useUIStore((s) => s.setGlobalSearchOpen);
  const newUntitled = useEditorStore((s) => s.newUntitled);
  const saveTab = useEditorStore((s) => s.saveTab);
  const splitRight = useEditorStore((s) => s.splitRight);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-bg-secondary px-2">
      <div className="flex items-center gap-1.5">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title={`切换侧边栏 (${MOD_LABEL}B)`}
      >
        <PanelLeft size={14} />
      </Button>
      </div>

      <div className="flex items-center gap-1">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs font-bold text-white">
          M
        </span>
        <span className="font-semibold">NoteForge</span>
      </div>

      <Dropdown
        align="start"
        trigger={
          <button className="flex items-center gap-1 rounded-sm px-2 py-1 text-sm hover:bg-bg-tertiary">
            知识库: <span className="font-medium">{ws?.name || "未打开"}</span>
            <ChevronDown size={12} className="text-text-tertiary" />
          </button>
        }
        items={[
          ...recent.map((r) => ({
            label: `📁 ${r.name}`,
            checked: ws?.id === r.id,
            onSelect: () => openWorkspace(r.path),
          })),
          ...(recent.length ? [{ separator: true, label: "" }] : []),
          {
            label: "打开知识库...",
            onSelect: async () => {
              const path = window.prompt("输入知识库路径", "/MemLab");
              if (!path) return;
              await openWorkspace(path);
            },
          },
        ]}
      />

      <div className="flex items-center gap-0.5">
        <Dropdown
          align="start"
          trigger={<button className="rounded-sm px-2 py-1 text-sm hover:bg-bg-tertiary">文件</button>}
          items={[
            { label: "新建", shortcut: `${MOD_LABEL}N`, onSelect: () => newUntitled() },
            { label: "保存", shortcut: `${MOD_LABEL}S`, onSelect: () => saveTab() },
            {
              label: "另存为",
              shortcut: `${MOD_LABEL}${SHIFT_LABEL}S`,
              onSelect: () => {
                const ed = useEditorStore.getState();
                const id = ed.activeTabIdByPane[ed.activePaneId];
                const tab = id ? ed.tabs.find((t) => t.id === id) : undefined;
                if (!id || !tab) return;
                if (isScratchTab(tab)) {
                  void promptSaveScratchTab(
                    id,
                    ws?.path,
                    (tid, path) => ed.saveTabAs(tid, path),
                    (tid) => openSaveAsDialog(tid),
                  );
                } else {
                  openSaveAsDialog(id);
                }
              },
            },
            { separator: true, label: "" },
            { label: "打开知识库", onSelect: () => useUIStore.getState().setSettingsOpen(false) },
          ]}
        />
        <Dropdown
          align="start"
          trigger={<button className="rounded-sm px-2 py-1 text-sm hover:bg-bg-tertiary">视图</button>}
          items={[
            {
              label: "切换侧边栏",
              shortcut: `${MOD_LABEL}B`,
              onSelect: () => setSidebarOpen(!sidebarOpen),
              checked: sidebarOpen,
            },
            {
              label: "切换右侧面板",
              onSelect: () => setRightOpen(!rightOpen),
              checked: rightOpen,
            },
            {
              label: "向右分屏",
              shortcut: `${MOD_LABEL}\\`,
              onSelect: () => splitRight(),
            },
            { separator: true, label: "" },
            {
              label: "亮色主题",
              checked: themeMode === "light",
              onSelect: () => setThemeMode("light"),
            },
            {
              label: "暗色主题",
              checked: themeMode === "dark",
              onSelect: () => setThemeMode("dark"),
            },
            {
              label: "跟随系统",
              checked: themeMode === "system",
              onSelect: () => setThemeMode("system"),
            },
          ]}
        />
        <Dropdown
          align="start"
          trigger={<button className="rounded-sm px-2 py-1 text-sm hover:bg-bg-tertiary">工具</button>}
          items={[
            {
              label: "全局搜索",
              shortcut: `${MOD_LABEL}⇧F`,
              onSelect: () => setGlobalSearchOpen(true),
            },
            {
              label: "新建记忆",
              onSelect: () => useUIStore.getState().setNewMemoryOpen(true),
            },
            {
              label: "导入 Agent 记忆",
              onSelect: () => useUIStore.getState().setImportWizardOpen(true),
            },
          ]}
        />
      </div>

      <div className="flex-1" />

      <button
        onClick={() => setGlobalSearchOpen(true)}
        className="flex h-7 items-center gap-2 rounded-md border border-border px-3 text-xs text-text-secondary hover:border-accent"
      >
        <Search size={12} /> 搜索全部
        <span className="kbd">{MOD_LABEL}P</span>
      </button>

      <Button size="icon" variant="ghost" onClick={() => saveTab()} title={`保存 (${MOD_LABEL}S)`}>
        <Save size={14} />
      </Button>

      <Button
        size="icon"
        variant="ghost"
        onClick={() =>
          setThemeMode(themeMode === "dark" ? "light" : themeMode === "light" ? "system" : "dark")
        }
        title={`当前主题: ${themeMode}`}
      >
        {themeMode === "dark" ? <Moon size={14} /> : themeMode === "light" ? <Sun size={14} /> : <Monitor size={14} />}
      </Button>

      <Button
        size="icon"
        variant="ghost"
        onClick={() => useUIStore.getState().setRightOpen(!rightOpen)}
        title="切换右侧面板"
      >
        <PanelRight size={14} />
      </Button>
    </header>
  );
}
