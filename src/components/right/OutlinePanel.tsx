import { useMemo } from "react";
import type { FileTier } from "@/core/document/file-tier";
import { LargeFileFeatureNotice } from "@/components/editor/LargeFileFeatureNotice";
import { useLargeFileOverrides } from "@/store/large-file-overrides";

interface Props {
  documentId: string;
  tier: FileTier;
  content: string;
  onHeadingClick?: (line: number) => void;
}

interface Heading {
  level: number;
  text: string;
  line: number;
}

export function OutlinePanel({ documentId, tier, content, onHeadingClick }: Props) {
  const outlineEnabled = useLargeFileOverrides((s) => s.isEnabled(documentId, tier, "outline"));
  const byteSize = useMemo(() => new TextEncoder().encode(content).length, [content]);

  const headings = useMemo<Heading[]>(() => {
    if (!outlineEnabled) return [];
    const out: Heading[] = [];
    content.split("\n").forEach((line, idx) => {
      const m = line.match(/^(#{1,6})\s+(.+)$/);
      if (m) out.push({ level: m[1].length, text: m[2].trim(), line: idx + 1 });
    });
    return out;
  }, [content, outlineEnabled]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary">
        大纲
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        <LargeFileFeatureNotice
          documentId={documentId}
          tier={tier}
          feature="outline"
          byteSize={byteSize}
          compact
        >
          {headings.length === 0 ? (
            <div className="py-4 text-center text-xs text-text-tertiary">无标题</div>
          ) : (
            headings.map((h, i) => (
              <button
                key={i}
                type="button"
                className="flex w-full cursor-pointer items-center gap-1 truncate rounded-sm py-0.5 text-left text-sm text-text-primary hover:bg-bg-tertiary"
                style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                title={h.text}
                onClick={() => onHeadingClick?.(h.line)}
              >
                <span className="text-xs text-text-tertiary">H{h.level}</span>
                <span className="truncate">{h.text}</span>
              </button>
            ))
          )}
        </LargeFileFeatureNotice>
      </div>
    </div>
  );
}
