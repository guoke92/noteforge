import { useEffect, useState } from "react";
import { Search, Tag } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useUIStore } from "@/store/ui";
import { useWorkspaceStore } from "@/store/workspace";
import { useEditorStore } from "@/store/editor";
import { knowledge } from "@/ipc";
import type { SearchResult } from "@/types";

type Mode = "all" | "filename" | "fulltext" | "tag";

export function GlobalSearchDialog() {
  const open = useUIStore((s) => s.globalSearchOpen);
  const setOpen = useUIStore((s) => s.setGlobalSearchOpen);
  const ws = useWorkspaceStore((s) => s.current);
  const openFile = useEditorStore((s) => s.openFile);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<Mode>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!q || !ws) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await knowledge.searchFulltext(ws.id, q, 30);
        setResults(
          mode === "filename"
            ? r.filter((x) => x.title.toLowerCase().includes(q.toLowerCase()))
            : mode === "tag"
              ? r.filter((x) => (x.tags || []).some((t) => t.toLowerCase().includes(q.toLowerCase())))
              : r,
        );
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [q, mode, ws]);

  return (
    <Dialog open={open} onOpenChange={setOpen} size="lg" title="全局搜索" showClose>
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-md border border-border bg-bg-secondary px-3 py-2">
          <Search size={16} className="text-text-secondary" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入关键词搜索文件名、全文、标签..."
            className="flex-1 bg-transparent text-base text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          {loading && <span className="text-xs text-text-tertiary">搜索中...</span>}
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <FilterChip active={mode === "all"} onClick={() => setMode("all")}>
            全部
          </FilterChip>
          <FilterChip active={mode === "filename"} onClick={() => setMode("filename")}>
            按文件名
          </FilterChip>
          <FilterChip active={mode === "fulltext"} onClick={() => setMode("fulltext")}>
            按全文
          </FilterChip>
          <FilterChip active={mode === "tag"} onClick={() => setMode("tag")}>
            按标签
          </FilterChip>
        </div>

        <div className="max-h-[55vh] min-h-32 overflow-y-auto rounded-md border border-border">
          {!q ? (
            <div className="px-3 py-4 text-center text-sm text-text-tertiary">
              输入关键词开始搜索 · Cmd+P 快速打开
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-text-tertiary">
              未找到匹配的内容 · 尝试更换关键词
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                onClick={() => {
                  setOpen(false);
                  void openFile(r.filePath);
                }}
                className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-bg-tertiary"
              >
                <div className="font-medium text-text-primary">📄 {r.title}</div>
                <div className="mt-0.5 truncate text-xs text-text-secondary">
                  {highlight(r.snippet, q)}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-text-tertiary">
                  <span>路径: {r.filePath}</span>
                  {r.tags?.length ? (
                    <div className="flex items-center gap-1">
                      <Tag size={9} />
                      {r.tags.slice(0, 3).map((t) => (
                        <span key={t} className="tag-chip">
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border px-2 py-0.5 transition-colors ${
        active ? "border-accent bg-accent text-white" : "border-border text-text-secondary hover:bg-bg-tertiary"
      }`}
    >
      {children}
    </button>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-warning/30 text-text-primary">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
