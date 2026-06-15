import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
} from "lucide-react";
import type { FileEntry } from "@/types";
import { useWorkspaceStore } from "@/store/workspace";
import { useEditorStore } from "@/store/editor";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface NodeProps {
  entry: FileEntry;
  depth: number;
}

function langIcon(lang?: string) {
  if (!lang) return <FileIcon size={14} />;
  if (lang === "markdown") return <FileText size={14} className="text-text-link" />;
  if (lang === "json") return <span className="font-mono text-xs">{"{ }"}</span>;
  if (lang === "yaml") return <span className="font-mono text-xs">⚙</span>;
  return <FileIcon size={14} />;
}

function FileNode({ entry, depth }: NodeProps) {
  const expanded = useWorkspaceStore((s) => s.expandedDirs.has(entry.path));
  const toggleDir = useWorkspaceStore((s) => s.toggleDir);
  const openFile = useEditorStore((s) => s.openFile);
  const refreshTree = useWorkspaceStore((s) => s.refreshTree);
  const renameEntry = useWorkspaceStore((s) => s.renameEntry);
  const deleteEntry = useWorkspaceStore((s) => s.deleteEntry);
  const createFileInDir = useWorkspaceStore((s) => s.createFileInDir);

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(entry.name);

  const onClick = async () => {
    if (entry.isDir) await toggleDir(entry.path);
    else await openFile(entry.path);
  };

  return (
    <>
      <div
        className={cn(
          "group flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-sm px-1 text-sm text-text-primary",
          "hover:bg-bg-tertiary",
        )}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={onClick}
        onDoubleClick={() => entry.isDir || openFile(entry.path)}
      >
        {entry.isDir ? (
          expanded ? (
            <ChevronDown size={12} className="shrink-0 text-text-secondary" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-text-secondary" />
          )
        ) : (
          <span className="w-3" />
        )}
        {entry.isDir ? (
          expanded ? (
            <FolderOpen size={14} className="shrink-0 text-warning" />
          ) : (
            <Folder size={14} className="shrink-0 text-warning" />
          )
        ) : (
          langIcon(entry.language)
        )}

        {renaming ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={async () => {
              if (newName && newName !== entry.name) await renameEntry(entry.path, newName);
              setRenaming(false);
            }}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                if (newName && newName !== entry.name) await renameEntry(entry.path, newName);
                setRenaming(false);
              } else if (e.key === "Escape") {
                setNewName(entry.name);
                setRenaming(false);
              }
            }}
            className="input flex-1"
          />
        ) : (
          <span className="flex-1 truncate">{entry.name}</span>
        )}

        <Dropdown
          align="end"
          trigger={
            <button
              onClick={(e) => e.stopPropagation()}
              className="invisible h-5 w-5 rounded-sm text-text-secondary hover:bg-bg-secondary group-hover:visible"
            >
              <MoreHorizontal size={14} />
            </button>
          }
          items={[
            ...(entry.isDir
              ? [
                  {
                    label: "新建文件",
                    onSelect: async () => {
                      const name = window.prompt("文件名 (含扩展名)", "new.md");
                      if (!name) return;
                      const created = await createFileInDir(entry.path, name);
                      await openFile(created);
                    },
                  },
                  {
                    label: "新建文件夹",
                    onSelect: async () => {
                      const name = window.prompt("文件夹名");
                      if (!name) return;
                      await useWorkspaceStore.getState().createDir(entry.path, name);
                    },
                  },
                  { separator: true, label: "" },
                ]
              : []),
            {
              label: "重命名",
              onSelect: () => {
                setNewName(entry.name);
                setRenaming(true);
              },
            },
            {
              label: "复制路径",
              onSelect: () => {
                navigator.clipboard?.writeText(entry.path).catch(() => {});
              },
            },
            { separator: true, label: "" },
            {
              label: "删除",
              danger: true,
              onSelect: async () => {
                if (!confirm(`删除 ${entry.name}?`)) return;
                await deleteEntry(entry.path);
              },
            },
            { separator: true, label: "" },
            { label: "刷新", onSelect: () => refreshTree() },
          ]}
        />
      </div>
      {entry.isDir && expanded && entry.children?.length ? (
        <div>
          {entry.children.map((c) => (
            <FileNode key={c.path} entry={c} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function FileTree() {
  const tree = useWorkspaceStore((s) => s.tree);
  const refreshTree = useWorkspaceStore((s) => s.refreshTree);
  const createFileInDir = useWorkspaceStore((s) => s.createFileInDir);
  const openFile = useEditorStore((s) => s.openFile);
  const current = useWorkspaceStore((s) => s.current);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  if (!current) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-text-secondary">
        <Folder size={32} className="text-text-tertiary" />
        <div>
          <div className="font-semibold text-text-primary">尚未打开知识库</div>
          <div className="text-xs">选择一个文件夹作为知识库开始使用</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-7 items-center justify-between px-2 text-xs font-medium uppercase tracking-wider text-text-secondary">
        <span className="truncate">{current.name}</span>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            title="新建文件"
            onClick={async () => {
              const name = window.prompt("文件名", "new.md");
              if (!name || !tree) return;
              const created = await createFileInDir(tree.path, name);
              await openFile(created);
            }}
          >
            <FilePlus size={13} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="新建文件夹"
            onClick={async () => {
              const name = window.prompt("文件夹名");
              if (!name || !tree) return;
              await useWorkspaceStore.getState().createDir(tree.path, name);
            }}
          >
            <FolderPlus size={13} />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {tree?.children?.length
          ? tree.children.map((c) => <FileNode key={c.path} entry={c} depth={0} />)
          : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-xs text-text-tertiary">
                <div>当前知识库为空</div>
                <div>支持 Markdown / JSON / YAML 文件</div>
              </div>
            )}
      </div>
    </div>
  );
}
