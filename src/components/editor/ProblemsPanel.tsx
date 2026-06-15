import { useMemo } from "react";
import { AlertTriangle, X } from "lucide-react";
import yaml from "js-yaml";
import { useUIStore } from "@/store/ui";
import { useEditorStore } from "@/store/editor";
import { tabLabel } from "@/lib/editor-doc";
import { Button } from "@/components/ui/Button";

interface Problem {
  file: string;
  line: number;
  message: string;
  severity: "error" | "warning";
}

export function ProblemsPanel() {
  const open = useUIStore((s) => s.problemsOpen);
  const setOpen = useUIStore((s) => s.setProblemsOpen);
  const tabs = useEditorStore((s) => s.tabs);

  const problems = useMemo<Problem[]>(() => {
    const out: Problem[] = [];
    for (const tab of tabs) {
      if (tab.language === "json") {
        try {
          JSON.parse(tab.content);
        } catch (e: any) {
          out.push({ file: tabLabel(tab), line: 1, message: String(e.message || e), severity: "error" });
        }
      } else if (tab.language === "yaml") {
        try {
          yaml.load(tab.content);
        } catch (e: any) {
          const msg = String(e.message || e);
          const lineMatch = msg.match(/line (\d+)/i);
          out.push({
            file: tabLabel(tab),
            line: lineMatch ? Number(lineMatch[1]) : 1,
            message: msg,
            severity: "error",
          });
        }
      }
    }
    return out;
  }, [tabs]);

  if (!open) return null;

  return (
    <div className="flex h-40 shrink-0 flex-col border-t border-border bg-bg-secondary">
      <div className="flex h-7 items-center justify-between border-b border-border px-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={11} className="text-warning" />
          Schema 校验: {problems.length} 问题
        </div>
        <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
          <X size={12} />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {problems.length === 0 ? (
          <div className="px-3 py-2 text-xs text-text-tertiary">未发现问题</div>
        ) : (
          problems.map((p, i) => (
            <div key={i} className="border-b border-border px-3 py-1.5 text-xs">
              <span className="font-medium text-danger">{p.file}:{p.line}</span>
              <span className="ml-2 text-text-secondary">{p.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
