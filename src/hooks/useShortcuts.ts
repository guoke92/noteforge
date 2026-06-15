import { useEffect } from "react";
import { getCore } from "@/core/runtime";
import { buildCommandContext } from "@/core/command/context";

export { MOD_LABEL, ALT_LABEL, SHIFT_LABEL } from "@/core/command/keybinding";

/** Global keyboard routing via CommandRegistry (ADR-007). */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod && e.key !== "F1") return;

      const matched = getCore().commands.matchKeybinding(e, buildCommandContext());
      if (!matched) return;

      e.preventDefault();
      void getCore().commands.execute(matched.id);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
