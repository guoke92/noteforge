import { useEffect, useMemo, useState } from "react";
import type { EditorTab } from "@/store/editor";
import { tabDisplayLanguage } from "@/lib/editor-doc";
import { fs, isTauri } from "@/ipc";
import { perfAsync, perfLog } from "@/lib/startup-perf";

interface Props {
  tab: EditorTab;
  onForceEdit?: () => void | Promise<void>;
  forcing?: boolean;
  loadError?: string | null;
}

interface FileStats {
  size: number;
  mtime: string;
  lineCountEstimate: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Read-only preview for Huge (>20MB) files. Shows first ~1000 lines without Monaco. */
export function LargeFilePreview({ tab, onForceEdit, forcing, loadError }: Props) {
  const [stats, setStats] = useState<FileStats | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const displayLang = tabDisplayLanguage(tab);
  const lineCount = useMemo(() => {
    if (!previewContent) return 0;
    return previewContent.split("\n").length;
  }, [previewContent]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      return perfAsync("editor.largeFilePreview.load", async () => {
      if (!tab.path) {
        setError("No file path available");
        setLoading(false);
        return;
      }

      try {
        const stat = await fs.stat(tab.path);
        if (cancelled) return;
        setStats(stat);

        const READ_SIZE = 128 * 1024;
        const range = await fs.readRange(tab.path, 0, READ_SIZE);
        if (cancelled) return;

        let content = range.content;
        if (range.truncated) {
          const lastNewline = content.lastIndexOf("\n");
          if (lastNewline > 0) {
            content = content.slice(0, lastNewline);
          }
          setTruncated(true);
        }
        setPreviewContent(content);
        perfLog("editor.largeFilePreview.loaded", {
          path: tab.path,
          bytes: stat.size,
          truncated: range.truncated,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      }, { path: tab.path });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tab.path]);

  async function openInExternalEditor() {
    if (!tab.path || !isTauri()) return;
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(tab.path);
    } catch (err) {
      console.error("Failed to open in external editor:", err);
    }
  }

  function handleForceEdit() {
    if (
      confirm(
        `此文件 ${stats ? formatBytes(stats.size) : ""} 较大，强制编辑可能导致性能问题。\n确定要继续吗？`,
      )
    ) {
      void onForceEdit?.();
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        <div className="text-center">
          <div className="mb-2 text-lg">加载大文件预览…</div>
          <div className="text-sm opacity-60">{tab.displayName}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-text-secondary">
        <div className="text-center">
          <div className="mb-2 text-lg text-red-400">加载失败</div>
          <div className="text-sm opacity-60">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-border bg-bg-secondary px-4 py-2 text-sm text-text-secondary">
        <span className="font-medium text-text-primary">{tab.displayName}</span>
        <span>{formatBytes(stats?.size ?? 0)}</span>
        <span>~{stats?.lineCountEstimate?.toLocaleString()} 行</span>
        <span className="opacity-60">{displayLang}</span>
        <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-600 dark:text-yellow-400">
          只读预览
        </span>
        <div className="flex-1" />
        {isTauri() && (
          <button
            className="rounded border border-border px-3 py-1 text-xs hover:bg-bg-tertiary"
            onClick={openInExternalEditor}
          >
            在外部编辑器中打开
          </button>
        )}
        <button
          className="rounded border border-border px-3 py-1 text-xs hover:bg-bg-tertiary disabled:opacity-50"
          onClick={handleForceEdit}
          disabled={forcing}
        >
          {forcing ? "加载中…" : "强制编辑"}
        </button>
      </div>

      {loadError && (
        <div className="bg-red-500/10 px-4 py-1.5 text-xs text-red-500">{loadError}</div>
      )}

      {truncated && (
        <div className="bg-yellow-500/10 px-4 py-1.5 text-xs text-yellow-600 dark:text-yellow-400">
          仅显示前 ~1000 行（文件过大，完整内容请在外部编辑器中查看）
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-bg-primary">
        <div className="flex min-h-full">
          <div
            className="sticky left-0 shrink-0 select-none border-r border-border bg-bg-secondary py-3 pl-3 pr-2 text-right font-mono text-xs leading-[22px] text-text-secondary"
            aria-hidden
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i + 1}>{i + 1}</div>
            ))}
          </div>
          <pre className="m-0 flex-1 whitespace-pre p-3 font-mono text-sm leading-[22px] text-text-primary">
            {previewContent}
          </pre>
        </div>
      </div>
    </div>
  );
}
