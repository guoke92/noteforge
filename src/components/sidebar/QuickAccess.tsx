import { useEffect, useState } from "react";
import { Pin, Star } from "lucide-react";
import { useEditorStore } from "@/store/editor";

interface PinnedItem {
  path: string;
  label: string;
}

const STORAGE_KEY = "noteforge:pinned";

function load(): PinnedItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function save(items: PinnedItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function QuickAccess() {
  const [items, setItems] = useState<PinnedItem[]>([]);
  const openFile = useEditorStore((s) => s.openFile);

  useEffect(() => {
    const initial = load();
    if (initial.length === 0) {
      const defaults: PinnedItem[] = [
        { path: "/MemLab/notebooks/agent-api.md", label: "今日笔记" },
        { path: "/MemLab/configs/server.yaml", label: "settings.yaml" },
      ];
      setItems(defaults);
      save(defaults);
    } else {
      setItems(initial);
    }
  }, []);

  return (
    <div className="px-2 py-1.5">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary">
        <Pin size={11} /> 快速访问
      </div>
      <div className="space-y-0.5">
        {items.map((it) => (
          <button
            key={it.path}
            onClick={() => openFile(it.path)}
            className="flex w-full items-center gap-1.5 rounded-sm px-1 py-1 text-left text-sm text-text-primary hover:bg-bg-tertiary"
          >
            <Star size={12} className="text-warning" />
            <span className="flex-1 truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
