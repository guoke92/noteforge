import type { FileTier } from "./file-tier";
import { getTierConfig } from "./file-tier";

/** Features that large/huge tiers disable by default but users may opt into per document. */
export type LargeFileFeature = "jsonTree" | "outline" | "problemsPanel" | "advancedMonaco";

export const OVERRIDABLE_LARGE_FILE_FEATURES: LargeFileFeature[] = [
  "jsonTree",
  "outline",
  "problemsPanel",
  "advancedMonaco",
];

export const LARGE_FILE_FEATURE_LABELS: Record<LargeFileFeature, string> = {
  jsonTree: "树形视图解析",
  outline: "大纲扫描",
  problemsPanel: "Schema 校验",
  advancedMonaco: "高级编辑特性",
};

export const LARGE_FILE_FEATURE_HINTS: Record<LargeFileFeature, string> = {
  jsonTree: "解析 JSON/YAML 为可浏览树结构，大文件可能较慢。",
  outline: "扫描 Markdown 标题生成大纲，大文件可能占用较多内存。",
  problemsPanel: "对 JSON/YAML 做语法校验并在问题面板显示结果。",
  advancedMonaco: "启用缩略图、代码折叠、括号着色与智能提示等。",
};

export function isFeatureEnabledByTier(tier: FileTier, feature: LargeFileFeature): boolean {
  if (tier === "normal") return true;
  const cfg = getTierConfig(tier);
  switch (feature) {
    case "jsonTree":
      return cfg.features.jsonTree;
    case "outline":
      return cfg.features.outline;
    case "problemsPanel":
      return cfg.features.problemsPanel;
    case "advancedMonaco":
      return false;
  }
}

export function resolveLargeFileFeature(
  tier: FileTier,
  feature: LargeFileFeature,
  manualOverrides: ReadonlySet<LargeFileFeature> | undefined,
): boolean {
  if (tier === "normal") return true;
  if (manualOverrides?.has(feature)) return true;
  return isFeatureEnabledByTier(tier, feature);
}

export function listDegradedFeatures(
  tier: FileTier,
  manualOverrides: ReadonlySet<LargeFileFeature> | undefined,
): LargeFileFeature[] {
  if (tier === "normal") return [];
  return OVERRIDABLE_LARGE_FILE_FEATURES.filter(
    (f) => !resolveLargeFileFeature(tier, f, manualOverrides),
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
