import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Backlink } from "@/types";
import { knowledge } from "@/ipc";
import { useEditorStore } from "@/store/editor";

interface Props {
  filePath: string;
}

export function BacklinksPanel({ filePath }: Props) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(false);
  const openFile = useEditorStore((s) => s.openFile);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    knowledge
      .getBacklinks(filePath)
      .then((r) => !cancelled && setBacklinks(r))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary">
        <span>反向链接</span>
        <span className="text-text-tertiary">{backlinks.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="py-4 text-center text-xs text-text-tertiary">加载中...</div>
        ) : backlinks.length === 0 ? (
          <div className="py-4 text-center text-xs text-text-tertiary">
            暂无其他笔记引用当前文件
          </div>
        ) : (
          <div className="space-y-2">
            {backlinks.map((b, i) => (
              <button
                key={i}
                onClick={() => openFile(b.sourceFile)}
                className="block w-full rounded-md border border-border p-2 text-left hover:border-accent"
              >
                <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-text-link">
                  <ExternalLink size={11} /> {b.sourceTitle}
                </div>
                <div className="text-xs text-text-secondary">{b.snippet}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
