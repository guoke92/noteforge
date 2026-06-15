import type { ThemeMode } from "@/types";

export const THEME_MODE_STORAGE_KEY = "noteforge:theme-mode";

export function resolveThemeEffective(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

export function readCachedTheme(): { mode: ThemeMode; effective: "light" | "dark" } {
  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY) as ThemeMode | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      return { mode: stored, effective: resolveThemeEffective(stored) };
    }
  } catch {
    /* ignore */
  }
  return { mode: "system", effective: resolveThemeEffective("system") };
}

export function writeThemeCache(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function applyThemeClass(effective: "light" | "dark"): void {
  const root = document.documentElement;
  root.classList.remove("light", "dark", "theme-light", "theme-dark");
  root.classList.add(effective);
  root.style.colorScheme = effective;
  root.style.backgroundColor = effective === "dark" ? "#0d1117" : "#ffffff";
}

/** Apply cached theme synchronously — call before first React paint. */
export function applyCachedTheme(): "light" | "dark" {
  const { effective } = readCachedTheme();
  applyThemeClass(effective);
  return effective;
}
