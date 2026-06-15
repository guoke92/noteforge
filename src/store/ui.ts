import { create } from "zustand";

export type SidebarMode = "files" | "memory" | "graph";
export type RightPanelMode = "backlinks" | "outline" | "properties" | "tree" | "ai";

interface UIState {
  sidebarOpen: boolean;
  sidebarMode: SidebarMode;
  sidebarWidth: number;
  rightOpen: boolean;
  rightMode: RightPanelMode;
  rightWidth: number;
  problemsOpen: boolean;
  commandPaletteOpen: boolean;
  globalSearchOpen: boolean;
  importWizardOpen: boolean;
  newMemoryOpen: boolean;
  settingsOpen: boolean;
  onboarded: boolean;

  setSidebarOpen: (open: boolean) => void;
  cycleSidebar: () => void;
  setSidebarMode: (mode: SidebarMode) => void;
  setSidebarWidth: (w: number) => void;
  setRightOpen: (open: boolean) => void;
  setRightMode: (mode: RightPanelMode) => void;
  setRightWidth: (w: number) => void;
  setProblemsOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setGlobalSearchOpen: (open: boolean) => void;
  setImportWizardOpen: (open: boolean) => void;
  setNewMemoryOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  markOnboarded: () => void;
}

const STORAGE_KEY = "noteforge:onboarded";

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: true,
  sidebarMode: "files",
  sidebarWidth: 260,
  rightOpen: true,
  rightMode: "backlinks",
  rightWidth: 300,
  problemsOpen: false,
  commandPaletteOpen: false,
  globalSearchOpen: false,
  importWizardOpen: false,
  newMemoryOpen: false,
  settingsOpen: false,
  onboarded: (() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  })(),

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  cycleSidebar: () => {
    const order: SidebarMode[] = ["files", "memory", "graph"];
    const idx = order.indexOf(get().sidebarMode);
    set({ sidebarMode: order[(idx + 1) % order.length], sidebarOpen: true });
  },
  setSidebarMode: (sidebarMode) => set({ sidebarMode, sidebarOpen: true }),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(200, Math.min(500, w)) }),
  setRightOpen: (rightOpen) => set({ rightOpen }),
  setRightMode: (rightMode) => set({ rightMode, rightOpen: true }),
  setRightWidth: (w) => set({ rightWidth: Math.max(220, Math.min(500, w)) }),
  setProblemsOpen: (problemsOpen) => set({ problemsOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setGlobalSearchOpen: (globalSearchOpen) => set({ globalSearchOpen }),
  setImportWizardOpen: (importWizardOpen) => set({ importWizardOpen }),
  setNewMemoryOpen: (newMemoryOpen) => set({ newMemoryOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  markOnboarded: () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    set({ onboarded: true });
  },
}));
