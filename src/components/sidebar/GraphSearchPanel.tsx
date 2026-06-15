import { useEffect, useState } from "react";
import { Network, Search, Tag } from "lucide-react";
import type { TagCount } from "@/types";
import { knowledge } from "@/ipc";
import { useWorkspaceStore } from "@/store/workspace";
import { useUIStore } from "@/store/ui";
import { Button } from "@/components/ui/Button";

export function GraphSearchPanel() {
  const ws = useWorkspaceStore((s) => s.current);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const setGlobalSearchOpen = useUIStore((s) => s.setGlobalSearchOpen);
  const setRightMode = useUIStore((s) => s.setRightMode);
  const setRightOpen = useUIStore((s) => s.setRightOpen);

  useEffect(() => {
    if (!ws) return;
    knowledge.getTags(ws.id).then(setTags).catch(() => setTags([]));
  }, [ws]);

  const filtered = tags.filter((t) => t.tag.toLowerCase().includes(filter.toLowerCase()));
  const maxCount = Math.max(...tags.map((t) => t.count), 1);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary">
        知识图谱与搜索
      </div>

      <div className="space-y-2 p-2">
        <Button variant="outline" className="w-full justify-start" onClick={() => setGlobalSearchOpen(true)}>
          <Search size={13} /> 全局搜索...
          <span className="kbd ml-auto">⌘P</span>
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => {
            setRightMode("tree");
            setRightOpen(true);
          }}
        >
          <Network size={13} /> 打开知识图谱
        </Button>
      </div>

      <div className="border-t border-border px-2 pt-2">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary">
          <Tag size={11} /> 标签云
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="过滤标签..."
          className="input mb-2"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {filtered.length === 0 ? (
            <div className="w-full py-4 text-center text-xs text-text-tertiary">无匹配标签</div>
          ) : (
            filtered.map((t) => {
              const active = activeTags.includes(t.tag);
              const ratio = t.count / maxCount;
              const sizeRem = 0.7 + ratio * 0.4;
              return (
                <button
                  key={t.tag}
                  onClick={() =>
                    setActiveTags((curr) =>
                      curr.includes(t.tag) ? curr.filter((x) => x !== t.tag) : [...curr, t.tag],
                    )
                  }
                  className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-medium leading-none transition-colors ${
                    active
                      ? "bg-accent text-white"
                      : "bg-tag-bg text-tag-text hover:opacity-80"
                  }`}
                  style={{ fontSize: `${sizeRem}rem` }}
                >
                  #{t.tag} <span className="text-[10px] opacity-70">({t.count})</span>
                </button>
              );
            })
          )}
        </div>

        {activeTags.length > 0 && (
          <div className="mt-3 rounded-sm border border-border bg-bg-secondary p-2 text-xs">
            <div className="mb-1 flex items-center justify-between font-medium">
              <span>已选: {activeTags.map((t) => "#" + t).join(" + ")}</span>
              <button
                onClick={() => setActiveTags([])}
                className="text-text-tertiary hover:text-text-primary"
              >
                清除
              </button>
            </div>
            <TagFilterResults workspaceId={ws?.id} tags={activeTags} />
          </div>
        )}
      </div>
    </div>
  );
}

function TagFilterResults({ workspaceId, tags }: { workspaceId?: string; tags: string[] }) {
  const [results, setResults] = useState<{ path: string; name: string }[]>([]);
  const openFile = useEditorStore_lazy();

  useEffect(() => {
    if (!workspaceId || tags.length === 0) {
      setResults([]);
      return;
    }
    knowledge.filterByTags(workspaceId, tags).then((r) =>
      setResults(r.map((f) => ({ path: f.path, name: f.name }))),
    );
  }, [workspaceId, tags]);

  if (results.length === 0) return <div className="text-text-tertiary">无匹配文件</div>;
  return (
    <div className="space-y-1">
      {results.map((r) => (
        <button
          key={r.path}
          onClick={() => openFile(r.path)}
          className="block w-full truncate rounded-sm px-1.5 py-1 text-left text-xs text-text-link hover:bg-bg-tertiary"
        >
          📄 {r.name}
        </button>
      ))}
    </div>
  );
}

// Avoid circular import at top by lazy-binding store hook
import { useEditorStore } from "@/store/editor";
function useEditorStore_lazy() {
  return useEditorStore((s) => s.openFile);
}
