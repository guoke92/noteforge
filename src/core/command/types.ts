/** ADR-007: All user actions register here — shortcuts, palette, menus share one path. */

export type CommandCategory =
  | "file"
  | "edit"
  | "view"
  | "note"
  | "navigation"
  | "workspace"
  | "ai";

export interface CommandContext {
  activeTabId: string | null;
  activePaneId: string;
  isEditorFocused: boolean;
  isInputContext: boolean;
  isMarkdownActive: boolean;
  hasActiveTab: boolean;
  surfaceMode: "live" | "source" | null;
  activeTab?: import("@/store/editor").EditorTab;
}

export interface Keybinding {
  /** e.g. "Mod+s", "Mod+Shift+p", "Alt+z" */
  chord: string;
  when?: string; // optional context clause, e.g. "editorFocus && markdown"
}

export interface CommandDefinition {
  id: string;
  title: string;
  category: CommandCategory;
  keybindings?: Keybinding[];
  /** When false, hidden from palette but still invokable programmatically. */
  palette?: boolean;
  enabled?: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext) => void | Promise<void>;
}

export interface CommandRegistry {
  register(command: CommandDefinition): () => void;
  execute(commandId: string): Promise<void>;
  list(filter?: { query?: string; category?: CommandCategory }): CommandDefinition[];
  matchKeybinding(event: KeyboardEvent, ctx: CommandContext): CommandDefinition | null;
}

/** Phase 0 minimum command ids — implement & wire in order. */
export const CORE_COMMANDS = {
  FILE_NEW: "file.new",
  FILE_SAVE: "file.save",
  FILE_SAVE_AS: "file.saveAs",
  FILE_CLOSE: "file.close",
  VIEW_TOGGLE_SIDEBAR: "view.toggleSidebar",
  VIEW_TOGGLE_RIGHT_PANEL: "view.toggleRightPanel",
  NAV_QUICK_OPEN: "nav.quickOpen",
  NAV_GLOBAL_SEARCH: "nav.globalSearch",
  WORKBENCH_SPLIT_RIGHT: "workbench.splitRight",
  NOTE_DAILY: "note.daily",
  APP_COMMAND_PALETTE: "app.commandPalette",
} as const;

export type CoreCommandId = (typeof CORE_COMMANDS)[keyof typeof CORE_COMMANDS];
