import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useDialogStore } from "@/core/dialog/dialog-store";
import type { DialogRequest } from "@/core/dialog/types";
import { getCore } from "@/core/runtime";
import { isAppExitCloseQueue, useEditorStore } from "@/store/editor";
import { useWorkspaceStore } from "@/store/workspace";
import {
  extensionForSave,
  isScratchTab,
  joinWorkspacePath,
  suggestedSaveFileName,
  tabLabel,
} from "@/lib/editor-doc";
import { useDocumentContent } from "@/hooks/useDocumentContent";
import { promptSaveScratchTab } from "@/lib/save-dialog";
import {
  completeDraftRestoreChoice,
  completeSaveConflictChoice,
} from "@/core/dialog/draft-prompt";
import { AlertTriangle, FileText, HardDrive } from "lucide-react";

export function DialogHost() {
  const active = useDialogStore((s) => s.active);

  if (!active) return null;

  switch (active.kind) {
    case "confirm-close":
      return <ConfirmCloseDialog request={active} />;
    case "save-as":
      return <SaveAsDialogView request={active} />;
    case "conflict":
      return <ConflictDialogView request={active} />;
    case "draft-restore-conflict":
      return <DraftRestoreConflictDialog request={active} />;
    case "save-conflict":
      return <SaveConflictDialog request={active} />;
    case "close-pane":
      return <ClosePaneDialogView request={active} />;
    case "confirm-delete":
      return <ConfirmDeleteDialogView request={active} />;
    default:
      return null;
  }
}

function closeDialog() {
  getCore().dialog.closeTop();
}

function ConfirmCloseDialog({ request }: { request: Extract<DialogRequest, { kind: "confirm-close" }> }) {
  const tabId = request.tabId;
  const wsPath = useWorkspaceStore((s) => s.current?.path);
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === tabId));
  const discardAndCloseTab = useEditorStore((s) => s.discardAndCloseTab);
  const revertTabChanges = useEditorStore((s) => s.revertTabChanges);
  const saveTab = useEditorStore((s) => s.saveTab);
  const saveTabAs = useEditorStore((s) => s.saveTabAs);
  const cancelCloseTabQueue = useEditorStore((s) => s.cancelCloseTabQueue);
  const continueCloseTabQueue = useEditorStore((s) => s.continueCloseTabQueue);
  const advanceAppExitQueue = useEditorStore((s) => s.advanceAppExitQueue);
  const appExit = isAppExitCloseQueue();

  const handleCancel = () => {
    cancelCloseTabQueue();
    closeDialog();
  };

  const handleSave = async () => {
    if (!tab) return;
    closeDialog();

    if (isScratchTab(tab)) {
      await promptSaveScratchTab(
        tabId,
        wsPath,
        saveTabAs,
        (tid) => getCore().dialog.open({ kind: "save-as", tabId: tid }),
      );
      const updated = useEditorStore.getState().tabs.find((t) => t.id === tabId);
      if (updated && updated.kind !== "scratch") {
        await discardAndCloseTab(tabId);
      } else {
        continueCloseTabQueue();
      }
      return;
    }

    await saveTab(tabId);
    if (appExit) {
      advanceAppExitQueue();
      return;
    }
    await discardAndCloseTab(tabId);
  };

  const handleDiscard = async () => {
    closeDialog();
    if (appExit) {
      await revertTabChanges(tabId);
      advanceAppExitQueue();
      return;
    }
    const current = useEditorStore.getState().tabs.find((t) => t.id === tabId);
    if (current?.kind === "workspace" && current.path) {
      const { deleteWorkspaceDraft } = await import(
        "@/core/session/workspace-draft-autosave"
      );
      await deleteWorkspaceDraft(current.path);
      await revertTabChanges(tabId);
    }
    await discardAndCloseTab(tabId);
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && handleCancel()}
      title="未保存的更改"
      description={
        tab
          ? appExit
            ? `「${tabLabel(tab)}」有未保存的更改，是否在退出前保存？`
            : `「${tabLabel(tab)}」有未保存的更改，是否在关闭前保存？`
          : undefined
      }
      size="sm"
    >
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={handleCancel}>
          取消
        </Button>
        <Button variant="ghost" onClick={() => void handleDiscard()}>
          不保存
        </Button>
        <Button variant="primary" onClick={() => void handleSave()}>
          保存
        </Button>
      </div>
    </Dialog>
  );
}

function SaveAsDialogView({ request }: { request: Extract<DialogRequest, { kind: "save-as" }> }) {
  const tabId = request.tabId;
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === tabId));
  const saveTabAs = useEditorStore((s) => s.saveTabAs);
  const wsPath = useWorkspaceStore((s) => s.current?.path);
  const docContent = useDocumentContent(tab?.documentId ?? "");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tab) {
      setFileName(suggestedSaveFileName(tab, docContent ?? ""));
      setError(null);
    }
  }, [tab, docContent, tab?.language]);

  const submit = async () => {
    if (!tab) return;
    let name = fileName.trim();
    if (!name) {
      setError("请输入文件名");
      return;
    }
    if (!name.includes(".")) {
      name = `${name}.${extensionForSave(docContent ?? "")}`;
    }
    if (name.includes("/") || name.includes("\\")) {
      setError("文件名不能包含路径分隔符");
      return;
    }
    const targetPath = joinWorkspacePath(wsPath || "/", name);
    setSaving(true);
    setError(null);
    try {
      await saveTabAs(tabId, targetPath);
      closeDialog();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && closeDialog()}
      title="另存为"
      description={
        wsPath ? `保存到当前工作区：${wsPath}` : "请先打开工作区，或将保存到默认目录"
      }
      size="sm"
    >
      <div className="flex flex-col gap-3">
        <label className="text-sm text-text-secondary">
          文件名
          <Input
            className="mt-1"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            autoFocus
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={closeDialog} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ConflictOptionCard({
  icon,
  title,
  description,
  variant = "default",
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  variant?: "default" | "primary";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
        variant === "primary"
          ? "border-accent/40 bg-accent/5 hover:bg-accent/10"
          : "border-border bg-bg-secondary hover:bg-bg-tertiary"
      }`}
    >
      <span className="mt-0.5 shrink-0 text-text-secondary">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-text-tertiary">{description}</span>
      </span>
    </button>
  );
}

function DraftRestoreConflictDialog({
  request,
}: {
  request: Extract<DialogRequest, { kind: "draft-restore-conflict" }>;
}) {
  const { conflict } = request;
  const fileName = conflict.vaultPath.split("/").pop() ?? conflict.vaultPath;

  const choose = (choice: "disk" | "cache") => {
    completeDraftRestoreChoice(choice);
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && choose("cache")}
      title="发现未保存的编辑缓存"
      description={`「${fileName}」的暂存内容与磁盘文件不一致。请选择要加载的版本。`}
      size="sm"
    >
      <div className="flex flex-col gap-2">
        <ConflictOptionCard
          variant="primary"
          icon={<FileText size={18} />}
          title="加载暂存内容"
          description="恢复上次编辑中的版本，继续未完成的修改。"
          onClick={() => choose("cache")}
        />
        <ConflictOptionCard
          icon={<HardDrive size={18} />}
          title="使用磁盘最新版本"
          description="丢弃暂存内容，从磁盘重新加载文件。"
          onClick={() => choose("disk")}
        />
      </div>
    </Dialog>
  );
}

function SaveConflictDialog({
  request,
}: {
  request: Extract<DialogRequest, { kind: "save-conflict" }>;
}) {
  const { conflict } = request;
  const fileName = conflict.vaultPath.split("/").pop() ?? conflict.vaultPath;

  const choose = (choice: "reload-from-disk" | "overwrite-disk" | "cancel") => {
    completeSaveConflictChoice(choice);
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && choose("cancel")}
      title="保存时检测到磁盘变更"
      description={`「${fileName}」在磁盘上已被修改。保存前请选择如何处理。`}
      size="sm"
    >
      <div className="flex flex-col gap-2">
        <ConflictOptionCard
          icon={<HardDrive size={18} />}
          title="加载磁盘版本"
          description="放弃当前编辑，使用磁盘上的最新内容。"
          onClick={() => choose("reload-from-disk")}
        />
        <ConflictOptionCard
          variant="primary"
          icon={<FileText size={18} />}
          title="覆盖磁盘保存"
          description="用当前编辑内容覆盖磁盘文件。"
          onClick={() => choose("overwrite-disk")}
        />
        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={() => choose("cancel")}>
            取消
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ConflictDialogView({ request }: { request: Extract<DialogRequest, { kind: "conflict" }> }) {
  const { conflict } = request;
  const fileName = conflict.vaultPath.split("/").pop() ?? conflict.vaultPath;

  const resolve = async (resolution: "reload-from-disk" | "keep-local" | "save-local-as-copy") => {
    closeDialog();
    await getCore().document.resolveConflict(conflict.documentId, resolution);
    const doc = getCore().document.get(conflict.documentId);
    if (doc) {
      const { syncDocumentToEditorTabs, pushContentToSurface } = await import("@/core/bridge/editor-sync");
      syncDocumentToEditorTabs(doc);
      if (resolution === "reload-from-disk") {
        pushContentToSurface(doc);
      }
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && void resolve("keep-local")}
      title="文件已在外部修改"
      description={`「${fileName}」在磁盘上的内容已变更。`}
      size="sm"
    >
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-text-secondary">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
        <span>检测到外部程序修改了此文件，请选择要保留的版本。</span>
      </div>
      <div className="flex flex-col gap-2">
        <ConflictOptionCard
          variant="primary"
          icon={<HardDrive size={18} />}
          title="从磁盘重新加载"
          description="丢弃本地未保存更改，使用磁盘最新内容。"
          onClick={() => void resolve("reload-from-disk")}
        />
        <ConflictOptionCard
          icon={<FileText size={18} />}
          title="保留本地更改"
          description="继续编辑本地版本；下次保存将覆盖磁盘文件。"
          onClick={() => void resolve("keep-local")}
        />
      </div>
    </Dialog>
  );
}

function ClosePaneDialogView({ request }: { request: Extract<DialogRequest, { kind: "close-pane" }> }) {
  const paneId = request.paneId;
  const panes = useEditorStore((s) => s.panes);
  const allTabs = useEditorStore((s) => s.tabs);
  const paneTabs = useMemo(() => allTabs.filter((t) => t.paneId === paneId), [allTabs, paneId]);
  const closePaneWithDisposition = useEditorStore((s) => s.closePaneWithDisposition);

  const paneIndex = panes.indexOf(paneId) + 1;
  const tabSummary =
    paneTabs.length <= 3
      ? paneTabs.map((t) => tabLabel(t)).join("、")
      : `${paneTabs
          .slice(0, 2)
          .map((t) => tabLabel(t))
          .join("、")} 等 ${paneTabs.length} 个标签`;

  const handle = (mode: "merge-to-main" | "close-tabs") => {
    closeDialog();
    void closePaneWithDisposition(paneId, mode);
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && closeDialog()}
      title={`关闭分屏 ${paneIndex}`}
      description={
        paneTabs.length
          ? `分屏中有 ${paneTabs.length} 个标签（${tabSummary}）。请选择如何处理这些标签后再关闭分屏。`
          : undefined
      }
      size="sm"
    >
      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={() => handle("merge-to-main")}>
          放回主屏
        </Button>
        <p className="px-1 text-xs text-text-tertiary">
          从主屏移入的标签将恢复到原位置；在分屏中打开的标签将追加到主屏末尾。
        </p>
        <Button variant="ghost" onClick={() => handle("close-tabs")}>
          关闭标签并移除分屏
        </Button>
        <p className="px-1 text-xs text-text-tertiary">直接关闭分屏内所有标签，未保存更改将丢失。</p>
        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={closeDialog}>
            取消
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ConfirmDeleteDialogView({
  request,
}: {
  request: Extract<DialogRequest, { kind: "confirm-delete" }>;
}) {
  const fileName = request.path.split("/").pop() ?? request.path;

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && closeDialog()}
      title="确认删除"
      description={`确定删除「${fileName}」？此操作不可撤销。`}
      size="sm"
    >
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={closeDialog}>
          取消
        </Button>
        <Button
          variant="primary"
          onClick={async () => {
            closeDialog();
            await getCore().vault.delete(request.path);
          }}
        >
          删除
        </Button>
      </div>
    </Dialog>
  );
}
