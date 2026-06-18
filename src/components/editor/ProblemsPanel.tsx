import { useMemo, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import yaml from "js-yaml";
import { useUIStore } from "@/store/ui";
import { useEditorStore } from "@/store/editor";
import { tabLabel } from "@/lib/editor-doc";
import { getCore } from "@/core/runtime";
import { Button } from "@/components/ui/Button";
import { useLargeFileOverrides, selectDocumentOverrideKey } from "@/store/large-file-overrides";
import { LargeFileFeatureNotice } from "@/components/editor/LargeFileFeatureNotice";

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
  const activePaneId = useEditorStore((s) => s.activePaneId);
  const activeTabId = useEditorStore((s) => s.activeTabIdByPane[activePaneId]);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeDocumentId = activeTab?.documentId;
  const [docRevision, setDocRevision] = useState(0);

  const overrideKey = useLargeFileOverrides((s) =>
    selectDocumentOverrideKey(s, activeDocumentId),
  );
  const validationEnabled = useLargeFileOverrides((s) => {
    if (!activeDocumentId) return true;
    const doc = getCore().document.get(activeDocumentId);
    if (!doc) return true;
    return s.isEnabled(activeDocumentId, doc.tier, "problemsPanel");
  });

  useEffect(() => {
    return getCore().eventBus.subscribe("document:changed", () => {
      setDocRevision((n) => n + 1);
    });
  }, []);

  const { problems, skippedLarge } = useMemo(() => {
    const out: Problem[] = [];
    let skippedLarge = false;
    const docService = getCore().document;
    const overrides = useLargeFileOverrides.getState();
    const seen = new Set<string>();

    for (const tab of tabs) {
      if (seen.has(tab.documentId)) continue;
      seen.add(tab.documentId);
      const doc = docService.get(tab.documentId);
      const content = doc?.content;
      if (!content || !doc) continue;
      if (tab.language !== "json" && tab.language !== "yaml") continue;

      if (!overrides.isEnabled(tab.documentId, doc.tier, "problemsPanel")) {
        if (doc.tier !== "normal") skippedLarge = true;
        continue;
      }

      if (tab.language === "json") {
        try {
          JSON.parse(content);
        } catch (e: unknown) {
          out.push({
            file: tabLabel(tab),
            line: 1,
            message: String((e as Error)?.message || e),
            severity: "error",
          });
        }
      } else {
        try {
          yaml.load(content);
        } catch (e: unknown) {
          const msg = String((e as Error)?.message || e);
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
    return { problems: out, skippedLarge };
  }, [tabs, docRevision, overrideKey]);

  if (!open) return null;

  const activeDoc = activeDocumentId ? getCore().document.get(activeDocumentId) : null;

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
        {skippedLarge && activeTab && activeDoc && activeDoc.tier !== "normal" && !validationEnabled ? (
          <LargeFileFeatureNotice
            documentId={activeTab.documentId}
            tier={activeDoc.tier}
            feature="problemsPanel"
            byteSize={activeDoc.fileSize}
            compact
          >
            <div className="px-3 py-2 text-xs text-text-tertiary">已启用 Schema 校验</div>
          </LargeFileFeatureNotice>
        ) : problems.length === 0 ? (
          <div className="px-3 py-2 text-xs text-text-tertiary">
            {skippedLarge ? "部分大文件已跳过校验（可在下方启用）" : "未发现问题"}
          </div>
        ) : (
          problems.map((p, i) => (
            <div key={i} className="border-b border-border px-3 py-1.5 text-xs">
              <span className="font-medium text-danger">
                {p.file}:{p.line}
              </span>
              <span className="ml-2 text-text-secondary">{p.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
