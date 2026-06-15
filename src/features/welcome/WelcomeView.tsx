import { BookOpen, FileText, Sparkles, Bot } from "lucide-react";
import { pickAndOpenVault } from "@/core/runtime";
import { useWorkspaceStore } from "@/store/workspace";
import { useEditorStore } from "@/store/editor";
// import { Button } from "@/components/ui/Button";
import { useUIStore } from "@/store/ui";

export function WelcomeView() {
  // const ws = useWorkspaceStore((s) => s.current);
  const recent = useWorkspaceStore((s) => s.recent);
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);
  const openFile = useEditorStore((s) => s.openFile);
  const setImportWizardOpen = useUIStore((s) => s.setImportWizardOpen);
  const setGlobalSearchOpen = useUIStore((s) => s.setGlobalSearchOpen);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-2xl text-white">
          M
        </div>
        <div>
          <div className="text-2xl font-semibold">NoteForge</div>
          <div className="text-sm text-text-secondary">Knowledge for humans and AI agents</div>
        </div>
      </div>

      <div className="max-w-md text-sm text-text-secondary">
        本地优先的工作空间：编辑笔记、解析双链、构建知识图谱，管理 Agent 记忆。
        <br />
        也可将文件或文件夹拖入窗口快速打开。
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        <ActionCard
          icon={<BookOpen size={18} />}
          title="选择知识库"
          desc="任意本地文件夹都可作为知识库"
          onClick={async () => {
            const opened = await pickAndOpenVault();
            if (!opened) {
              const path = window.prompt("输入知识库路径", "/MemLab");
              if (!path) return;
              await openWorkspace(path);
            }
          }}
        />
        <ActionCard
          icon={<FileText size={18} />}
          title="打开示例笔记"
          desc="agent-api.md / knowledge-base.md"
          onClick={async () => {
            await openFile("/MemLab/notebooks/agent-api.md");
          }}
        />
        <ActionCard
          icon={<Bot size={18} />}
          title="导入 Agent 记忆"
          desc="Ollama / MemGPT 等格式"
          onClick={() => setImportWizardOpen(true)}
        />
        <ActionCard
          icon={<Sparkles size={18} />}
          title="全局搜索"
          desc="按文件名 / 全文 / 标签搜索"
          onClick={() => setGlobalSearchOpen(true)}
        />
      </div>

      {recent.length > 0 && (
        <div className="w-full max-w-md text-left">
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary">
            最近的知识库
          </div>
          {recent.map((r) => (
            <button
              key={r.id}
              onClick={() => openWorkspace(r.path)}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-bg-tertiary"
            >
              <span>📁 {r.name}</span>
              <span className="text-xs text-text-tertiary">{r.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-md border border-border bg-surface p-3 text-left transition-colors hover:border-accent"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-tertiary text-accent">
        {icon}
      </div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-text-secondary">{desc}</div>
      </div>
    </button>
  );
}
