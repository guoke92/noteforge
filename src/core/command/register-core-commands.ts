import { useEditorStore } from "@/store/editor";
import { useUIStore } from "@/store/ui";
import { useWorkspaceStore } from "@/store/workspace";
import { openSaveAsDialog } from "@/core/dialog/dialog-api";
import { openDailyNote } from "@/core/note/daily-note";
import { promptSaveScratchTab } from "@/lib/save-dialog";
import type { CommandRegistry } from "./types";
import { CORE_COMMANDS } from "./types";
import { cmd } from "./command-registry.impl";

export function registerCoreCommands(registry: CommandRegistry): void {
  registry.register(
    cmd({
      id: CORE_COMMANDS.FILE_NEW,
      title: "新建笔记",
      category: "file",
      keybindings: [{ chord: "Mod+n", when: "!inputContext" }],
      run: () => {
        useEditorStore.getState().newUntitled();
      },
    }),
  );

  registry.register(
    cmd({
      id: CORE_COMMANDS.FILE_SAVE,
      title: "保存",
      category: "file",
      keybindings: [{ chord: "Mod+s" }],
      run: () => {
        void useEditorStore.getState().saveTab();
      },
    }),
  );

  registry.register(
    cmd({
      id: CORE_COMMANDS.FILE_SAVE_AS,
      title: "另存为",
      category: "file",
      keybindings: [{ chord: "Mod+Shift+s", when: "hasActiveTab" }],
      enabled: (ctx) => ctx.hasActiveTab,
      run: (ctx) => {
        const tab = ctx.activeTab;
        if (!tab) return;
        if (tab.kind === "scratch") {
          void promptSaveScratchTab(
            tab.id,
            useWorkspaceStore.getState().current?.path,
            (tid, path) => useEditorStore.getState().saveTabAs(tid, path),
            (tid) => openSaveAsDialog(tid),
          );
        } else {
          openSaveAsDialog(tab.id);
        }
      },
    }),
  );

  registry.register(
    cmd({
      id: CORE_COMMANDS.FILE_CLOSE,
      title: "关闭标签",
      category: "file",
      keybindings: [{ chord: "Mod+w", when: "!inputContext" }],
      enabled: (ctx) => !!ctx.activeTabId,
      run: (ctx) => {
        if (ctx.activeTabId) {
          useEditorStore.getState().closeTab(ctx.activeTabId);
        }
      },
    }),
  );

  registry.register(
    cmd({
      id: CORE_COMMANDS.VIEW_TOGGLE_SIDEBAR,
      title: "切换侧边栏",
      category: "view",
      keybindings: [{ chord: "Mod+b" }],
      run: () => {
        const ui = useUIStore.getState();
        ui.setSidebarOpen(!ui.sidebarOpen);
      },
    }),
  );

  registry.register(
    cmd({
      id: CORE_COMMANDS.VIEW_TOGGLE_RIGHT_PANEL,
      title: "切换右侧面板",
      category: "view",
      run: () => {
        const ui = useUIStore.getState();
        ui.setRightOpen(!ui.rightOpen);
      },
    }),
  );

  registry.register(
    cmd({
      id: CORE_COMMANDS.NAV_QUICK_OPEN,
      title: "快速打开 / 搜索",
      category: "navigation",
      keybindings: [{ chord: "Mod+p" }],
      run: () => {
        useUIStore.getState().setGlobalSearchOpen(true);
      },
    }),
  );

  registry.register(
    cmd({
      id: CORE_COMMANDS.NAV_GLOBAL_SEARCH,
      title: "全局搜索",
      category: "navigation",
      keybindings: [{ chord: "Mod+Shift+f" }],
      run: () => {
        useUIStore.getState().setGlobalSearchOpen(true);
      },
    }),
  );

  registry.register(
    cmd({
      id: CORE_COMMANDS.WORKBENCH_SPLIT_RIGHT,
      title: "向右分屏",
      category: "workspace",
      keybindings: [{ chord: "Mod+\\" }],
      run: () => {
        useEditorStore.getState().splitRight();
      },
    }),
  );

  registry.register(
    cmd({
      id: CORE_COMMANDS.APP_COMMAND_PALETTE,
      title: "命令面板",
      category: "navigation",
      keybindings: [{ chord: "Mod+Shift+o" }, { chord: "F1" }],
      run: () => {
        useUIStore.getState().setCommandPaletteOpen(true);
      },
    }),
  );

  registry.register(
    cmd({
      id: "markdown.cycleSurfaceMode",
      title: "切换 Markdown 表面模式",
      category: "note",
      keybindings: [{ chord: "Mod+Shift+i", when: "markdown" }],
      enabled: (ctx) => ctx.isMarkdownActive,
      run: (ctx) => {
        if (ctx.activeTabId) {
          useEditorStore.getState().cycleSurfaceMode(ctx.activeTabId);
        }
      },
    }),
  );

  registry.register(
    cmd({
      id: "editor.cycleLanguage",
      title: "切换语言模式",
      category: "edit",
      keybindings: [{ chord: "Mod+Shift+p", when: "hasActiveTab" }],
      enabled: (ctx) => ctx.hasActiveTab,
      run: (ctx) => {
        const tab = ctx.activeTab;
        if (!tab) return;
        const order = [
          "markdown",
          "json",
          "yaml",
          "typescript",
          "javascript",
          "python",
          "rust",
        ];
        const idx = order.indexOf(tab.language);
        const next = order[(idx + 1) % order.length] || "markdown";
        useEditorStore.getState().setLanguage(tab.id, next);
      },
    }),
  );

  registry.register(
    cmd({
      id: CORE_COMMANDS.NOTE_DAILY,
      title: "打开今日日记",
      category: "note",
      palette: true,
      run: () => {
        void openDailyNote();
      },
    }),
  );
}
