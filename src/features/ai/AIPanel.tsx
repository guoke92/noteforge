import { useEffect } from "react";
import {
  Bot,
  Check,
  Copy,
  RefreshCcw,
  Send,
  Sparkles,
  X,
  Languages,
  FileSearch,
  Edit3,
} from "lucide-react";
import { useAIStore } from "@/store/ai";
// import { useEditorStore } from "@/store/editor";
import { Button } from "@/components/ui/Button";
import { MOD_LABEL } from "@/hooks/useShortcuts";

function DiffView({ original, refined }: { original: string; refined: string }) {
  // Tiny line-based diff: green for refined lines, red for removed lines
  const a = original.split("\n");
  const b = refined.split("\n");
  return (
    <div className="space-y-0.5 rounded-md border border-border bg-bg-secondary p-2 font-mono text-xs">
      {a.map((line, i) => (
        <div
          key={`a${i}`}
          className="bg-[color:var(--color-diff-delete)] px-2 py-0.5 line-through text-text-secondary"
        >
          - {line}
        </div>
      ))}
      {b.map((line, i) => (
        <div key={`b${i}`} className="bg-[color:var(--color-diff-insert)] px-2 py-0.5 text-text-primary">
          + {line}
        </div>
      ))}
    </div>
  );
}

export function AIPanel() {
  const {
    loading,
    origin,
    result,
    instruction,
    history,
    models,
    selectedModel,
    status,
    errorMessage,
  } = useAIStore();
  const setInstruction = useAIStore((s) => s.setInstruction);
  const refine = useAIStore((s) => s.refineSelection);
  const retry = useAIStore((s) => s.retry);
  const summarize = useAIStore((s) => s.summarize);
  const loadModels = useAIStore((s) => s.loadModels);
  const selectModel = useAIStore((s) => s.selectModel);
  const close = useAIStore((s) => s.close);

  useEffect(() => {
    if (models.length === 0) void loadModels();
  }, [loadModels, models.length]);

  const apply = () => {
    if (!result) return;
    // Replace current selection in active editor
    const editor = (window as any).monaco?.editor?.getEditors?.()?.[0];
    if (!editor) {
      navigator.clipboard?.writeText(result).catch(() => {});
      alert("已复制到剪贴板");
      return;
    }
    const selection = editor.getSelection();
    if (selection) {
      editor.executeEdits("noteforge-ai", [
        { range: selection, text: result, forceMoveMarkers: true },
      ]);
    }
    close();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-bg-secondary px-2 py-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium uppercase tracking-wider text-text-secondary">
            <Bot size={11} /> AI 协作者
          </span>
          <select
            value={selectedModel || ""}
            onChange={(e) => selectModel(e.target.value)}
            className="rounded-sm border border-border bg-bg-primary px-1.5 py-0.5 text-xs"
          >
            {models.length === 0 && <option>无可用模型</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.available}>
                {m.provider}/{m.name}
                {m.available ? "" : " (离线)"}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              status === "ready" ? "bg-success" : status === "no-model" ? "bg-warning" : "bg-danger"
            }`}
          />
          <span className="text-text-secondary">
            {status === "ready" ? "在线" : status === "no-model" ? "无可用模型" : "离线"}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-2">
        {!origin && !loading && (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-text-tertiary">
            选中编辑器内的文本，按 {MOD_LABEL}⇧E 或使用浮动工具栏触发 AI 精炼。
          </div>
        )}

        {origin && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-secondary">
              原始内容
            </div>
            <div className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-bg-primary p-2 text-xs">
              {origin}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
              指令
            </span>
          </div>
          <div className="flex items-center gap-1">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="让这段话更专业..."
              className="input flex-1"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => origin && refine(origin, instruction)}
              disabled={!origin || loading}
            >
              <Send size={12} /> 精炼
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          <QuickAction
            icon={<Sparkles size={11} />}
            label="精炼"
            onClick={() => origin && refine(origin, "对该段落进行精炼，去冗余但保留事实")}
            disabled={!origin || loading}
          />
          <QuickAction
            icon={<FileSearch size={11} />}
            label="摘要"
            onClick={() => origin && summarize(origin)}
            disabled={!origin || loading}
          />
          <QuickAction
            icon={<Edit3 size={11} />}
            label="改写更专业"
            onClick={() => origin && refine(origin, "用更专业、正式的语气改写")}
            disabled={!origin || loading}
          />
          <QuickAction
            icon={<Languages size={11} />}
            label="翻译为英文"
            onClick={() => origin && refine(origin, "翻译为流畅英文，保持术语一致")}
            disabled={!origin || loading}
          />
        </div>

        {loading && (
          <div className="rounded-md border border-border bg-bg-secondary p-3 text-center text-xs text-text-secondary">
            <span className="inline-block animate-pulse">◌ AI 正在思考...</span>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
            ⚠ {errorMessage}
          </div>
        )}

        {result && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                精炼结果
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigator.clipboard?.writeText(result).catch(() => {})}
                >
                  <Copy size={11} /> 复制
                </Button>
                <Button size="sm" variant="ghost" onClick={retry}>
                  <RefreshCcw size={11} /> 重试
                </Button>
              </div>
            </div>
            <div className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-bg-primary p-2 text-xs">
              {result}
            </div>

            {origin && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-text-secondary">差异对比</summary>
                <div className="mt-1">
                  <DiffView original={origin} refined={result} />
                </div>
              </details>
            )}

            <div className="mt-2 flex items-center justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={close}>
                <X size={12} /> 取消
              </Button>
              <Button size="sm" variant="primary" onClick={apply}>
                <Check size={12} /> 替换原文
              </Button>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-secondary">
              历史
            </div>
            <div className="space-y-1.5">
              {history.slice(0, 5).map((h, i) => (
                <div key={i} className="rounded-md border border-border bg-bg-primary p-2 text-xs">
                  <div className="mb-0.5 font-medium text-text-secondary">{h.instruction}</div>
                  <div className="truncate text-text-tertiary">{h.result.slice(0, 80)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-primary px-2 py-1 text-text-primary transition-colors hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon} {label}
    </button>
  );
}
