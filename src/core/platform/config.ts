/** Editor & vault preferences — wired in Phase 0 persistence, UI in later phase. */

export interface AutoSaveConfig {
  enabled: boolean;
  debounceMs: number;
}

export interface EditorDefaultsConfig {
  defaultSurfaceMode: "live" | "source";
  tabSize: number;
  fontSize: number;
  fontFamily: string;
  wordWrap: boolean;
  newNoteDirectory: string; // relative to vault root, e.g. "Inbox"
  dailyNoteDirectory: string;
  dailyNoteFormat: string; // e.g. "YYYY-MM-DD"
}

export interface AppPreferences {
  autoSave: AutoSaveConfig;
  editor: EditorDefaultsConfig;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  autoSave: {
    enabled: true,
    debounceMs: 2000,
  },
  editor: {
    defaultSurfaceMode: "live",
    tabSize: 2,
    fontSize: 15,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif",
    wordWrap: true,
    newNoteDirectory: "Inbox",
    dailyNoteDirectory: "Journal",
    dailyNoteFormat: "YYYY-MM-DD",
  },
};
