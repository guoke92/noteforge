import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useUIStore } from "@/store/ui";
import { useThemeStore } from "@/store/theme";
import { useAIStore } from "@/store/ai";
import { Button } from "@/components/ui/Button";
import { ai } from "@/ipc";
import type { ThemeMode } from "@/types";

export function SettingsDialog() {
  const open = useUIStore((s) => s.settingsOpen);
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const models = useAIStore((s) => s.models);
  const selectedModel = useAIStore((s) => s.selectedModel);
  const selectModel = useAIStore((s) => s.selectModel);
  const status = useAIStore((s) => s.status);
  const loadModels = useAIStore((s) => s.loadModels);

  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("ollama");
  const [endpoint, setEndpoint] = useState("http://localhost:11434");
  const [testResult, setTestResult] = useState<string>("");

  useEffect(() => {
    if (open && models.length === 0) void loadModels();
  }, [open, models.length, loadModels]);

  const testConnection = async () => {
    setTestResult("测试中...");
    try {
      await ai.configureModel(provider, apiKey, endpoint);
      await loadModels();
      const found = useAIStore.getState().models.find((m) => m.provider === provider && m.available);
      setTestResult(found ? `✓ 已连接：${found.name} (${found.latencyMs || "?"}ms)` : "未发现可用模型");
    } catch (e) {
      setTestResult(`✗ 失败: ${String(e)}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} title="设置" size="lg">
      <div className="space-y-5 text-sm">
        <section>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
            外观
          </div>
          <div className="flex items-center gap-1">
            {(["light", "dark", "system"] as ThemeMode[]).map((m) => (
              <Button
                key={m}
                variant={mode === m ? "primary" : "outline"}
                size="sm"
                onClick={() => setMode(m)}
              >
                {m === "light" ? "亮色" : m === "dark" ? "暗色" : "跟随系统"}
              </Button>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
            AI 模型
          </div>
          <div className="space-y-3 rounded-md border border-border p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="provider"
                checked={provider === "ollama"}
                onChange={() => setProvider("ollama")}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium">本地模型 (Ollama)</div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <label className="text-text-secondary">模型</label>
                  <select
                    value={selectedModel || ""}
                    onChange={(e) => selectModel(e.target.value)}
                    className="rounded-sm border border-border bg-bg-primary px-2 py-0.5"
                  >
                    {models
                      .filter((m) => m.provider === "ollama")
                      .map((m) => (
                        <option key={m.id} value={m.id} disabled={!m.available}>
                          {m.name} {m.available ? `(${m.latencyMs ?? "?"}ms)` : "(离线)"}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <label className="text-text-secondary">服务地址</label>
                  <input
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      status === "ready" ? "bg-success" : status === "no-model" ? "bg-warning" : "bg-danger"
                    }`}
                  />
                  状态: {status === "ready" ? "在线" : status === "no-model" ? "无可用模型" : "离线"}
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="provider"
                checked={provider !== "ollama"}
                onChange={() => setProvider("openai")}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium">云端 API</div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <label className="text-text-secondary">提供商</label>
                  <select
                    value={provider === "ollama" ? "openai" : provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="rounded-sm border border-border bg-bg-primary px-2 py-0.5"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <label className="text-text-secondary">API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="••••••••••••"
                    className="input"
                  />
                </div>
              </div>
            </label>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" onClick={testConnection}>
              测试连接
            </Button>
            {testResult && <span className="text-xs text-text-secondary">{testResult}</span>}
          </div>
        </section>

        <section>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
            关于 NoteForge
          </div>
          <div className="text-xs text-text-secondary">
            版本 0.1.0 · Tauri v2 · 本地优先的知识与记忆工作空间
          </div>
        </section>
      </div>
    </Dialog>
  );
}
