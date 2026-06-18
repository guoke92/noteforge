import type { ReactNode } from "react";
import type { FileTier } from "@/core/document/file-tier";
import {
  type LargeFileFeature,
  LARGE_FILE_FEATURE_HINTS,
  LARGE_FILE_FEATURE_LABELS,
  formatFileSize,
} from "@/core/document/large-file-features";
import { useLargeFileOverrides } from "@/store/large-file-overrides";
import { Button } from "@/components/ui/Button";

interface Props {
  documentId: string;
  tier: FileTier;
  feature: LargeFileFeature;
  byteSize?: number;
  children: ReactNode;
  /** Compact layout for narrow panels. */
  compact?: boolean;
}

export function LargeFileFeatureNotice({
  documentId,
  tier,
  feature,
  byteSize,
  children,
  compact = false,
}: Props) {
  const enabled = useLargeFileOverrides((s) => s.isEnabled(documentId, tier, feature));
  const enable = useLargeFileOverrides((s) => s.enable);

  if (enabled) {
    return <>{children}</>;
  }

  const label = LARGE_FILE_FEATURE_LABELS[feature];
  const hint = LARGE_FILE_FEATURE_HINTS[feature];
  const sizeHint = byteSize != null ? ` (${formatFileSize(byteSize)})` : "";

  return (
    <div
      className={
        compact
          ? "space-y-2 px-3 py-3 text-xs text-text-secondary"
          : "space-y-3 px-4 py-4 text-xs text-text-secondary"
      }
    >
      <p className="text-text-primary">
        大文件{sizeHint}：已默认禁用{label}
      </p>
      <p className="text-text-tertiary">{hint}</p>
      <Button size="sm" variant="outline" onClick={() => enable(documentId, feature)}>
        启用{label}
      </Button>
    </div>
  );
}
