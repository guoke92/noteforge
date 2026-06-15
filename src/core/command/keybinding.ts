const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(
    String(
      // @ts-expect-error userAgentData not in TS DOM lib
      navigator.userAgentData?.platform ?? navigator.userAgent ?? navigator.platform,
    ),
  );

export const MOD_LABEL = isMac ? "⌘" : "Ctrl";
export const ALT_LABEL = isMac ? "⌥" : "Alt";
export const SHIFT_LABEL = isMac ? "⇧" : "Shift";

export function platformIsMac(): boolean {
  return isMac;
}

/** Normalize KeyboardEvent to chord like Mod+Shift+p */
export function eventToChord(event: KeyboardEvent): string {
  const parts: string[] = [];
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod) parts.push("Mod");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");

  let key = event.key;
  if (key === "|") key = "\\";
  if (key.length === 1) key = key.toLowerCase();
  if (key === " ") key = "Space";
  parts.push(key);
  return parts.join("+");
}

/** Normalize declared chord for comparison. */
export function normalizeChord(chord: string): string {
  return chord
    .split("+")
    .map((part) => {
      const p = part.trim();
      if (p.toLowerCase() === "mod") return "Mod";
      if (p.toLowerCase() === "shift") return "Shift";
      if (p.toLowerCase() === "alt") return "Alt";
      if (p.length === 1) return p.toLowerCase();
      return p;
    })
    .join("+");
}

export function chordsMatch(event: KeyboardEvent, chord: string): boolean {
  return eventToChord(event) === normalizeChord(chord);
}

export function formatChord(chord: string): string {
  return normalizeChord(chord)
    .replace(/Mod/g, MOD_LABEL)
    .replace(/Shift/g, SHIFT_LABEL)
    .replace(/Alt/g, ALT_LABEL);
}
