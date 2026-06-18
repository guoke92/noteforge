import { create } from "zustand";
import type { FileTier } from "@/core/document/file-tier";
import {
  type LargeFileFeature,
  resolveLargeFileFeature,
} from "@/core/document/large-file-features";

interface LargeFileOverridesState {
  /** documentId → manually enabled features for this session. */
  byDocument: Record<string, LargeFileFeature[]>;

  isEnabled(documentId: string, tier: FileTier, feature: LargeFileFeature): boolean;
  enable(documentId: string, feature: LargeFileFeature): void;
  clearDocument(documentId: string): void;
}

/** Stable empty array — never use inline `?? []` in selectors. */
export const EMPTY_OVERRIDES: readonly LargeFileFeature[] = [];

function overrideSet(byDocument: Record<string, LargeFileFeature[]>, documentId: string) {
  return new Set(byDocument[documentId] ?? EMPTY_OVERRIDES);
}

export function selectDocumentOverrideKey(
  state: LargeFileOverridesState,
  documentId: string | undefined,
): string {
  if (!documentId) return "";
  return state.byDocument[documentId]?.join("\0") ?? "";
}

export const useLargeFileOverrides = create<LargeFileOverridesState>((set, get) => ({
  byDocument: {},

  isEnabled(documentId, tier, feature) {
    const overrides = overrideSet(get().byDocument, documentId);
    return resolveLargeFileFeature(tier, feature, overrides);
  },

  enable(documentId, feature) {
    set((state) => {
      const prev = state.byDocument[documentId] ?? [];
      if (prev.includes(feature)) return state;
      return {
        byDocument: {
          ...state.byDocument,
          [documentId]: [...prev, feature],
        },
      };
    });
  },

  clearDocument(documentId) {
    set((state) => {
      if (!state.byDocument[documentId]) return state;
      const next = { ...state.byDocument };
      delete next[documentId];
      return { byDocument: next };
    });
  },
}));
