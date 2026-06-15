import { FolderTree, Bot, Network, Settings } from "lucide-react";
import type { SidebarMode } from "@/store/ui";
import { useUIStore } from "@/store/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import { FileTree } from "./FileTree";
import { MemoryPanel } from "./MemoryPanel";
import { GraphSearchPanel } from "./GraphSearchPanel";
import { QuickAccess } from "./QuickAccess";

type SidebarProps = Record<string, never>;

const ITEMS: { mode: SidebarMode; icon: typeof FolderTree; label: string }[] = [
  { mode: "files", icon: FolderTree, label: "文件树" },
  { mode: "memory", icon: Bot, label: "Agent 记忆" },
  { mode: "graph", icon: Network, label: "知识图谱·搜索" },
];

export function Sidebar(_: SidebarProps) {
  const mode = useUIStore((s) => s.sidebarMode);
  const setMode = useUIStore((s) => s.setSidebarMode);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  return (
    <aside className="flex h-full w-full flex-row bg-bg-secondary">
      <div className="flex w-10 shrink-0 flex-col items-center justify-between border-r border-border bg-bg-secondary py-2">
        <div className="flex flex-col gap-1">
          {ITEMS.map(({ mode: m, icon: Icon, label }) => {
            const active = mode === m;
            return (
              <Tooltip key={m} side="right" content={label}>
                <button
                  onClick={() => setMode(m)}
                  aria-pressed={active}
                  className={`flex h-8 w-8 items-center justify-center rounded-sm transition-colors ${
                    active
                      ? "bg-bg-tertiary text-accent"
                      : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                  }`}
                >
                  <Icon size={18} />
                </button>
              </Tooltip>
            );
          })}
        </div>
        <Tooltip side="right" content="设置">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
          >
            <Settings size={16} />
          </button>
        </Tooltip>
      </div>

      <div className="flex h-full flex-1 flex-col overflow-hidden">
        {mode === "files" && (
          <>
            <QuickAccess />
            <div className="divider" />
            <FileTree />
          </>
        )}
        {mode === "memory" && <MemoryPanel />}
        {mode === "graph" && <GraphSearchPanel />}
      </div>
    </aside>
  );
}
