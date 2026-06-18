export type FileTier = "normal" | "large" | "huge";

/** 2 MB — switch to degraded mode. */
export const LARGE_THRESHOLD = 2 * 1024 * 1024;
/** 20 MB — switch to read-only preview. */
export const HUGE_THRESHOLD = 20 * 1024 * 1024;

export function getFileTier(byteSize: number): FileTier {
  if (byteSize >= HUGE_THRESHOLD) return "huge";
  if (byteSize >= LARGE_THRESHOLD) return "large";
  return "normal";
}

export interface TierConfig {
  monaco: {
    minimap: boolean;
    folding: boolean;
    bracketPairColorization: boolean;
    wordBasedSuggestions: "currentDocument" | "off";
    formatOnPaste: boolean;
    largeFileOptimizations: boolean;
    quickSuggestions: { other: boolean; comments: boolean; strings: boolean };
  };
  features: {
    jsonTree: boolean;
    jsonValidation: boolean;
    outline: boolean;
    problemsPanel: boolean;
  };
  draftDebounceMs: number;
  readOnly: boolean;
}

const NORMAL_CONFIG: TierConfig = {
  monaco: {
    minimap: true,
    folding: true,
    bracketPairColorization: true,
    wordBasedSuggestions: "currentDocument",
    formatOnPaste: true,
    largeFileOptimizations: true,
    quickSuggestions: { other: true, comments: false, strings: false },
  },
  features: {
    jsonTree: true,
    jsonValidation: true,
    outline: true,
    problemsPanel: true,
  },
  draftDebounceMs: 1500,
  readOnly: false,
};

const LARGE_CONFIG: TierConfig = {
  monaco: {
    minimap: false,
    folding: false,
    bracketPairColorization: false,
    wordBasedSuggestions: "off",
    formatOnPaste: false,
    largeFileOptimizations: true,
    quickSuggestions: { other: false, comments: false, strings: false },
  },
  features: {
    jsonTree: false,
    jsonValidation: false,
    outline: false,
    problemsPanel: false,
  },
  draftDebounceMs: 10_000,
  readOnly: false,
};

const HUGE_CONFIG: TierConfig = {
  ...LARGE_CONFIG,
  features: {
    jsonTree: false,
    jsonValidation: false,
    outline: false,
    problemsPanel: false,
  },
  draftDebounceMs: 30_000,
  readOnly: true,
};

export function getTierConfig(tier: FileTier): TierConfig {
  switch (tier) {
    case "normal":
      return NORMAL_CONFIG;
    case "large":
      return LARGE_CONFIG;
    case "huge":
      return HUGE_CONFIG;
  }
}
