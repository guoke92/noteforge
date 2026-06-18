import type { FileTier } from "@/core/document/file-tier";

/** Max simultaneous Monaco instances for large/huge documents (Phase 2.1). */
const MAX_LARGE_MONACO_SLOTS = 2;

const slots = new Set<string>();

export function isHeavyFileTier(tier: FileTier): boolean {
  return tier === "large" || tier === "huge";
}

export function acquireMonacoSlot(tabId: string): boolean {
  if (slots.has(tabId)) return true;
  if (slots.size >= MAX_LARGE_MONACO_SLOTS) return false;
  slots.add(tabId);
  return true;
}

export function releaseMonacoSlot(tabId: string): void {
  slots.delete(tabId);
}

export function largeMonacoSlotLimit(): number {
  return MAX_LARGE_MONACO_SLOTS;
}
