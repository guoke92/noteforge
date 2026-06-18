import { useCallback, useEffect, useState } from "react";
import { Clock, RotateCcw, Trash2 } from "lucide-react";
import type { SnapshotMeta } from "@/core/local-history/types";
import {
  listHistorySnapshots,
  loadHistorySnapshot,
  deleteHistory,
} from "@/core/local-history/service";
import { getCore } from "@/core/runtime";
import { Button } from "@/components/ui/Button";

interface Props {
  vaultPath: string | undefined;
}

export function TimelinePanel({ vaultPath }: Props) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ timestamp: string; content: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!vaultPath) return;
    setLoading(true);
    try {
      const list = await listHistorySnapshots(vaultPath);
      setSnapshots(list);
    } finally {
      setLoading(false);
    }
  }, [vaultPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handlePreview = async (snap: SnapshotMeta) => {
    if (preview?.timestamp === snap.timestamp) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const content = await loadHistorySnapshot(snap.vaultPath, snap.timestamp);
      if (content !== null) {
        setPreview({ timestamp: snap.timestamp, content });
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRestore = async (snap: SnapshotMeta) => {
    if (!vaultPath) return;
    const content = await loadHistorySnapshot(snap.vaultPath, snap.timestamp);
    if (content === null) return;
    const core = getCore();
    const doc = core.document.list().find((d) => d.vaultPath === vaultPath);
    if (!doc) return;

    core.editorHost.flushAllSurfacesForDocument(doc.id);
    await core.document.ensureContentLoaded(doc.id);
    core.document.applyPatch(doc.id, { kind: "replace-all", content });
    const updated = core.document.get(doc.id);
    if (updated) {
      const { syncDocumentToEditorTabs, pushContentToSurface } = await import(
        "@/core/bridge/editor-sync"
      );
      syncDocumentToEditorTabs(updated);
      pushContentToSurface(updated);
    }
    setPreview(null);
  };

  const handleDeleteAll = async () => {
    if (!vaultPath) return;
    await deleteHistory(vaultPath);
    setSnapshots([]);
    setPreview(null);
  };

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "刚刚";
      if (diffMin < 60) return `${diffMin} 分钟前`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr} 小时前`;
      const diffDay = Math.floor(diffHr / 24);
      if (diffDay < 7) return `${diffDay} 天前`;
      return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
    } catch {
      return ts;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!vaultPath) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-center text-xs text-text-tertiary">
        打开一个文件以查看历史版本
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary">
        <span>本地历史</span>
        <div className="flex items-center gap-1">
          <span className="text-text-tertiary">{snapshots.length}</span>
          {snapshots.length > 0 && (
            <Button size="icon" variant="ghost" onClick={handleDeleteAll} title="清除全部历史">
              <Trash2 size={11} />
            </Button>
          )}
        </div>
      </div>

      {/* Preview panel */}
      {preview && (
        <div className="max-h-48 overflow-y-auto border-b border-border bg-bg-tertiary p-2">
          <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
            <span>预览 — {formatTime(preview.timestamp)}</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() =>
                void handleRestore(snapshots.find((s) => s.timestamp === preview.timestamp)!)
              }
              title="恢复此版本"
            >
              <RotateCcw size={11} />
            </Button>
          </div>
          <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-text-secondary">
            {preview.content.slice(0, 4000)}
            {preview.content.length > 4000 && "\n... (截断)"}
          </pre>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="py-4 text-center text-xs text-text-tertiary">加载中...</div>
        ) : snapshots.length === 0 ? (
          <div className="py-4 text-center text-xs text-text-tertiary">
            暂无历史快照
          </div>
        ) : (
          <div className="space-y-1">
            {snapshots.map((snap) => (
              <button
                key={snap.timestamp}
                onClick={() => void handlePreview(snap)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  preview?.timestamp === snap.timestamp
                    ? "bg-bg-tertiary ring-1 ring-accent"
                    : "hover:bg-bg-tertiary"
                }`}
              >
                <Clock size={11} className="shrink-0 text-text-tertiary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-text-primary">
                    {formatTime(snap.timestamp)}
                  </div>
                  <div className="text-[10px] text-text-tertiary">
                    {formatSize(snap.size)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        {previewLoading && (
          <div className="py-2 text-center text-xs text-text-tertiary">加载快照...</div>
        )}
      </div>
    </div>
  );
}
