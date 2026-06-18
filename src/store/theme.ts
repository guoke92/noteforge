import { create } from "zustand";
import type { ThemeMode } from "@/types";
import { system } from "@/ipc";
import {
  applyThemeClass,
  readCachedTheme,
  resolveThemeEffective,
  writeThemeCache,
} from "@/lib/theme-cache";
import { perfAsync, perfLog } from "@/lib/startup-perf";

interface ThemeState {
  mode: ThemeMode;
  effective: "light" | "dark";
  setMode: (mode: ThemeMode) => Promise<void>;
  init: () => Promise<void>;
}

const cachedTheme = typeof window !== "undefined" ? readCachedTheme() : { mode: "system" as ThemeMode, effective: "light" as const };

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: cachedTheme.mode,
  effective: cachedTheme.effective,

  async init() {
    try {
      const { theme } = await perfAsync("theme.ipc.getTheme", () => system.getTheme());
      const effective = resolveThemeEffective(theme);
      applyThemeClass(effective);
      writeThemeCache(theme);
      set({ mode: theme, effective });
      perfLog("theme.applied", { mode: theme, effective });
    } catch {
      const effective = resolveThemeEffective("system");
      applyThemeClass(effective);
      writeThemeCache("system");
      set({ mode: "system", effective });
      perfLog("theme.applied-fallback", { mode: "system", effective });
    }

    if (typeof window !== "undefined") {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (get().mode === "system") {
          const effective = resolveThemeEffective("system");
          applyThemeClass(effective);
          writeThemeCache("system");
          set({ effective });
        }
      });
    }
  },

  async setMode(mode: ThemeMode) {
    try {
      await system.setTheme(mode);
    } catch {
      /* ignore in stub mode */
    }
    const effective = resolveThemeEffective(mode);
    applyThemeClass(effective);
    writeThemeCache(mode);
    set({ mode, effective });
  },
}));
