import { Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useUIStore } from "@/store/ui";
import { Button } from "@/components/ui/Button";
import { useState } from "react";

export function OnboardingDialog() {
  const onboarded = useUIStore((s) => s.onboarded);
  const markOnboarded = useUIStore((s) => s.markOnboarded);
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "欢迎使用 NoteForge",
      body: "NoteForge 是一个本地优先的工作空间：为人类与 AI Agent 双向服务的笔记 / 配置 / 记忆管理工具。",
    },
    {
      title: "知识库 = 文件夹",
      body: "任意本地目录都可作为知识库。打开后会自动索引 Markdown / JSON / YAML 文件，并构建双向链接与标签云。",
    },
    {
      title: "Agent 记忆",
      body: "将 Ollama / MemGPT 等 Agent 的记忆目录接入 NoteForge，统一查看、编辑、批量管理。",
    },
    {
      title: "AI 协作者",
      body: "选中编辑器内文本 → 按 ⌘⇧E 调用 AI 精炼。所有 AI 操作均通过 Diff 确认后写回。",
    },
  ];

  if (onboarded) return null;

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <Dialog
      open={!onboarded}
      onOpenChange={(o) => !o && markOnboarded()}
      size="md"
      showClose={false}
    >
      <div className="space-y-4 px-2 py-1">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white">
            <Sparkles size={16} />
          </div>
          <div className="text-lg font-semibold">{current.title}</div>
        </div>
        <p className="text-sm leading-relaxed text-text-secondary">{current.body}</p>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full ${
                  i === step ? "bg-accent" : "bg-border"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={markOnboarded}>
              跳过
            </Button>
            {last ? (
              <Button variant="primary" onClick={markOnboarded}>
                开始使用
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                下一步
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
