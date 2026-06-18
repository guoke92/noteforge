import { Bot, Clock, FileText, Link2, List, Network, X } from "lucide-react";
import { useUIStore } from "@/store/ui";
import type { RightPanelMode } from "@/store/ui";
import { useEditorStore } from "@/store/editor";
import { useDocumentRecord } from "@/hooks/useDocumentContent";
import { BacklinksPanel } from "./BacklinksPanel";
import { OutlinePanel } from "./OutlinePanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { GraphView } from "@/features/graph/GraphView";
import { AIPanel } from "@/features/ai/AIPanel";
import { TimelinePanel } from "./TimelinePanel";
import { Tooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";

const TABS: { mode: RightPanelMode; icon: typeof Link2; label: string }[] = [
  { mode: "backlinks", icon: Link2, label: "反向链接" },
  { mode: "outline", icon: List, label: "大纲" },
  { mode: "properties", icon: FileText, label: "属性" },
  { mode: "tree", icon: Network, label: "知识图谱" },
  { mode: "ai", icon: Bot, label: "AI 协作者" },
  { mode: "history", icon: Clock, label: "本地历史" },
];

export function RightPanel() {
  const mode = useUIStore((s) => s.rightMode);
  const setMode = useUIStore((s) => s.setRightMode);
  const setOpen = useUIStore((s) => s.setRightOpen);
  const activePaneId = useEditorStore((s) => s.activePaneId);
  const activeId = useEditorStore((s) => s.activeTabIdByPane[activePaneId]);
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === activeId));
  const doc = useDocumentRecord(tab?.documentId ?? "");
  const requestRevealLine = useEditorStore((s) => s.requestRevealLine);
  const docContent = doc?.content ?? "";

  const handleHeadingClick = (line: number) => {
    if (!tab) return;
    requestRevealLine(tab.id, line);
  };

  return (
    <aside className="flex h-full w-full flex-col bg-bg-secondary">
      <div className="flex h-9 items-center justify-between border-b border-border px-1.5">
        <div className="flex items-center gap-0.5">
          {TABS.map(({ mode: m, icon: Icon, label }) => (
            <Tooltip key={m} content={label}>
              <button
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
                  mode === m
                    ? "bg-bg-tertiary text-accent"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                }`}
              >
                <Icon size={14} />
              </button>
            </Tooltip>
          ))}
        </div>
        <Button size="icon" variant="ghost" onClick={() => setOpen(false)} title="关闭面板">
          <X size={14} />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        {mode === "backlinks" && tab?.path ? (
          <BacklinksPanel filePath={tab.path} />
        ) : mode === "outline" && tab && doc ? (
          <OutlinePanel
            documentId={tab.documentId}
            tier={doc.tier}
            content={docContent}
            onHeadingClick={handleHeadingClick}
          />
        ) : mode === "properties" && tab ? (
          <PropertiesPanel content={docContent ?? ""} filePath={tab.path} />
        ) : mode === "tree" ? (
          <GraphView />
        ) : mode === "ai" ? (
          <AIPanel />
        ) : mode === "history" ? (
          <TimelinePanel vaultPath={tab?.path} />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-text-tertiary">
            打开一个文件以查看相关信息
          </div>
        )}
      </div>
    </aside>
  );
}
