import { Bot, Database, FileWarning, Sparkles, WifiOff } from "lucide-react";
import { useEditorStore, isDirty } from "@/store/editor";
import { isScratchTab } from "@/lib/editor-doc";
import { useDocumentRecord } from "@/hooks/useDocumentContent";
import { useWorkspaceStore } from "@/store/workspace";
import { useUIStore } from "@/store/ui";
import { useAIStore } from "@/store/ai";
import { Dropdown } from "@/components/ui/Dropdown";
import { MOD_LABEL } from "@/hooks/useShortcuts";
import {
  DEFAULT_CARET_STATUS,
  formatSelectionSummary,
} from "@/lib/editor-caret-status";
import { useLargeFileOverrides, selectDocumentOverrideKey, EMPTY_OVERRIDES } from "@/store/large-file-overrides";
import {
  LARGE_FILE_FEATURE_LABELS,
  listDegradedFeatures,
} from "@/core/document/large-file-features";
import { useMemo } from "react";

const LANGUAGES = [
  "markdown",
  "json",
  "yaml",
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "java",
  "cpp",
  "html",
  "css",
  "shell",
  "sql",
  "xml",
  "toml",
  "plaintext",
];

export function StatusBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activePaneId = useEditorStore((s) => s.activePaneId);
  const activeId = useEditorStore((s) => s.activeTabIdByPane[activePaneId]);
  const setLanguage = useEditorStore((s) => s.setLanguage);
  const saveTab = useEditorStore((s) => s.saveTab);
  const ws = useWorkspaceStore((s) => s.current);
  const setProblemsOpen = useUIStore((s) => s.setProblemsOpen);
  const aiStatus = useAIStore((s) => s.status);
  const aiModels = useAIStore((s) => s.models);
  const selectedModel = useAIStore((s) => s.selectedModel);
  const selectModel = useAIStore((s) => s.selectModel);

  const tab = tabs.find((t) => t.id === activeId);
  const doc = useDocumentRecord(tab?.documentId ?? "");
  const enableFeature = useLargeFileOverrides((s) => s.enable);
  const overrideKey = useLargeFileOverrides((s) =>
    selectDocumentOverrideKey(s, tab?.documentId),
  );
  const degradedFeatures = useMemo(() => {
    if (!tab || !doc || doc.tier === "normal") return [];
    const overrides = useLargeFileOverrides.getState().byDocument[tab.documentId] ?? EMPTY_OVERRIDES;
    return listDegradedFeatures(doc.tier, new Set(overrides));
  }, [tab, doc, overrideKey]);
  const dirty = tab && isDirty(tab);
  const caret = useEditorStore((s) =>
    activeId ? (s.caretStatusByTab[activeId] ?? DEFAULT_CARET_STATUS) : DEFAULT_CARET_STATUS,
  );
  const selectionSummary = formatSelectionSummary(caret);

  const statusLabel = ((): { text: string; cls: string; icon: React.ReactNode } => {
    switch (aiStatus) {
      case "ready":
        return { text: "AI Ready", cls: "text-success", icon: <Sparkles size={11} /> };
      case "no-model":
        return { text: "AI 未就绪", cls: "text-warning", icon: <Bot size={11} /> };
      case "offline":
      default:
        return { text: "AI 离线", cls: "text-text-tertiary", icon: <WifiOff size={11} /> };
    }
  })();

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-bg-secondary px-2 text-xs text-text-secondary">
      <div className="flex items-center gap-1">
        Ln <span className="text-text-primary">{caret.line}</span>, Col{" "}
        <span className="text-text-primary">{caret.column}</span>
        {selectionSummary ? (
          <>
            <span className="text-text-tertiary">·</span>
            <span className="text-text-primary">{selectionSummary}</span>
          </>
        ) : null}
      </div>

      <Separator />

      <Dropdown
        trigger={
          <button className="rounded-sm px-1.5 py-0.5 text-text-primary hover:bg-bg-tertiary">
            {tab?.language || "—"}
          </button>
        }
        items={LANGUAGES.map((lang) => ({
          label: lang,
          checked: tab?.language === lang,
          onSelect: () => tab && setLanguage(tab.id, lang),
        }))}
        align="end"
        side="top"
      />

      <Separator />
      <span>UTF-8</span>
      <Separator />
      <span>LF</span>

      <div className="flex-1" />

      {degradedFeatures.length > 0 && tab && doc ? (
        <>
          <Dropdown
            trigger={
              <button className="rounded-sm bg-warning/10 px-2 py-0.5 text-warning hover:bg-warning/20">
                大文件模式 · {degradedFeatures.length} 项已降级
              </button>
            }
            side="top"
            align="end"
            items={degradedFeatures.map((feature) => ({
              label: `启用${LARGE_FILE_FEATURE_LABELS[feature]}`,
              onSelect: () => enableFeature(tab.documentId, feature),
            }))}
          />
          <Separator />
        </>
      ) : null}

      {tab && isScratchTab(tab) && (
        <span className="rounded-sm bg-bg-tertiary px-2 py-0.5 text-text-tertiary">草稿</span>
      )}

      {dirty && (
        <button
          onClick={() => tab && saveTab(tab.id)}
          className="flex items-center gap-1 rounded-sm bg-warning/10 px-2 py-0.5 font-medium text-warning hover:bg-warning/20"
        >
          ● 未保存 ({MOD_LABEL}+S)
        </button>
      )}

      <button
        onClick={() => setProblemsOpen(true)}
        className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 hover:bg-bg-tertiary"
      >
        <FileWarning size={11} /> 问题
      </button>

      <Separator />

      <span className="flex items-center gap-1">
        <Database size={11} />
        {ws?.name || "—"}
      </span>

      <Separator />

      <Dropdown
        trigger={
          <button className={`flex items-center gap-1 rounded-sm px-1.5 py-0.5 hover:bg-bg-tertiary ${statusLabel.cls}`}>
            {statusLabel.icon}
            <span>{statusLabel.text}</span>
            {selectedModel && <span className="text-text-tertiary">({selectedModel})</span>}
          </button>
        }
        side="top"
        align="end"
        items={[
          ...aiModels.map((m) => ({
            label: `${m.provider}/${m.name}${m.available ? " ●" : " ○"}`,
            checked: selectedModel === m.id,
            onSelect: () => m.available && selectModel(m.id),
            disabled: !m.available,
          })),
          { separator: true, label: "" },
          {
            label: "AI 设置...",
            onSelect: () => useUIStore.getState().setSettingsOpen(true),
          },
        ]}
      />
    </div>
  );
}

function Separator() {
  return <span className="h-3 w-px bg-border" />;
}
