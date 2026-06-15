import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useUIStore } from "@/store/ui";
import { Button } from "@/components/ui/Button";
import { memory } from "@/ipc";
import type { Agent, MemoryType } from "@/types";

export function NewMemoryDialog() {
  const open = useUIStore((s) => s.newMemoryOpen);
  const setOpen = useUIStore((s) => s.setNewMemoryOpen);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MemoryType>("fact");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    memory.listAgents().then((a) => {
      setAgents(a);
      if (a[0]) setAgentId(a[0].id);
    });
  }, [open]);

  const save = async () => {
    if (!agentId || !content.trim()) return;
    setSaving(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await memory.create(agentId, content, type, title || content.slice(0, 32), tags);
      setOpen(false);
      setTitle("");
      setContent("");
      setTagsInput("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} title="新建记忆" size="lg">
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Agent</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="input"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">类型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MemoryType)}
              className="input"
            >
              <option value="conversation">conversation</option>
              <option value="fact">fact</option>
              <option value="procedure">procedure</option>
              <option value="context">context</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">标题</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="关于 NoteForge 的架构设计"
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">内容</label>
          <textarea
            rows={8}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="# 笔记标题&#10;&#10;在此输入记忆内容，支持 Markdown 与双链 [[...]]"
            className="input resize-y font-mono"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            标签 (逗号分隔)
          </label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="architecture, design"
            className="input"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button variant="primary" onClick={save} disabled={saving || !content.trim()}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
