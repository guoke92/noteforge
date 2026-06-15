import { useMemo } from "react";

interface Props {
  content: string;
  onHeadingClick?: (line: number) => void;
}

interface Heading {
  level: number;
  text: string;
  line: number;
}

export function OutlinePanel({ content, onHeadingClick }: Props) {
  const headings = useMemo<Heading[]>(() => {
    const out: Heading[] = [];
    content.split("\n").forEach((line, idx) => {
      const m = line.match(/^(#{1,6})\s+(.+)$/);
      if (m) out.push({ level: m[1].length, text: m[2].trim(), line: idx + 1 });
    });
    return out;
  }, [content]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary">
        大纲
      </div>
      <div className="flex-1 overflow-y-auto py-1">
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
      </div>
    </div>
  );
}
