import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, FolderInput } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useUIStore } from "@/store/ui";
import { Button } from "@/components/ui/Button";
import { memory } from "@/ipc";

interface AgentMap {
  name: string;
  type: "openclaw" | "memgpt" | "custom";
  target: string;
}

export function ImportWizardDialog() {
  const open = useUIStore((s) => s.importWizardOpen);
  const setOpen = useUIStore((s) => s.setImportWizardOpen);
  const [step, setStep] = useState(1);
  const [sourceDir, setSourceDir] = useState("/Users/me/memories");
  const [detected, setDetected] = useState<string[]>([]);
  const [maps, setMaps] = useState<AgentMap[]>([
    { name: "Ollama-main", type: "openclaw", target: "mem-1" },
    { name: "MemGPT-dev", type: "memgpt", target: "mem-2" },
  ]);
  const [keepCopy, setKeepCopy] = useState(false);
  const [autoLinks, setAutoLinks] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);

  const detect = () => {
    // Stub: pretend we detected Ollama + MemGPT
    setDetected(["Ollama (memories/)", "MemGPT (agents/)"]);
  };

  const finish = async () => {
    setImporting(true);
    try {
      // Demo: produce one record per agent mapping
      const data = maps
        .map((m) => `${m.name} 记忆: 从 ${sourceDir} 导入的初始记忆条目示例`)
        .join("\n\n");
      const r = await memory.importFrom("agent-ollama", "openclaw", data);
      setResult(r);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep(1);
    setDetected([]);
    setResult(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      size="lg"
      title="导入 Agent 记忆"
      description={`步骤 ${step}/3`}
    >
      <div className="space-y-4">
        {step === 1 && (
          <div className="space-y-3">
            <div className="text-sm">
              <label className="mb-1 block text-xs font-medium text-text-secondary">源目录</label>
              <div className="flex items-center gap-2">
                <input
                  value={sourceDir}
                  onChange={(e) => setSourceDir(e.target.value)}
                  className="input"
                />
                <Button variant="outline" onClick={detect}>
                  <FolderInput size={13} /> 选择
                </Button>
              </div>
            </div>
            {detected.length > 0 && (
              <div className="rounded-md border border-border bg-bg-secondary p-2 text-sm">
                <div className="mb-1 text-xs font-medium text-text-secondary">检测到:</div>
                {detected.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-success">
                    <Check size={12} /> {d}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="mb-2 text-sm font-medium">映射 Agent</div>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-bg-secondary text-xs uppercase tracking-wider text-text-secondary">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Agent 名称</th>
                    <th className="px-2 py-1.5 text-left">类型</th>
                    <th className="px-2 py-1.5 text-left">导入至</th>
                  </tr>
                </thead>
                <tbody>
                  {maps.map((m, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1.5">{m.name}</td>
                      <td className="px-2 py-1.5">{m.type}</td>
                      <td className="px-2 py-1.5">
                        <input
                          value={m.target}
                          onChange={(e) =>
                            setMaps((mm) =>
                              mm.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)),
                            )
                          }
                          className="input"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-bg-secondary p-3 text-sm">
              将导入 {maps.length * 8} 条记忆到当前知识库
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={keepCopy}
                onChange={(e) => setKeepCopy(e.target.checked)}
              />
              保留原始文件副本
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoLinks}
                onChange={(e) => setAutoLinks(e.target.checked)}
              />
              自动解析双链
            </label>

            {result && (
              <div className="rounded-md border border-success/40 bg-success/10 p-2 text-sm text-success">
                ✓ 导入完成：成功 {result.imported} 条，失败 {result.errors.length} 条
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button
            variant="outline"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
          >
            <ArrowLeft size={13} /> 上一步
          </Button>
          {step < 3 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              下一步 <ArrowRight size={13} />
            </Button>
          ) : (
            <Button variant="primary" onClick={finish} disabled={importing || !!result}>
              {importing ? "导入中..." : result ? "已完成" : "完成导入"}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
