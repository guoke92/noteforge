import { useMemo, useRef, useState } from "react";
import type { EditorTab } from "@/store/editor";
import { useEditorStore } from "@/store/editor";
import { MonacoEditor, type MonacoEditorBinding } from "./MonacoEditor";
import { TreeView } from "@/features/json-yaml/TreeView";
import { findJsonPathAtLine, findLineForJsonPath, type JsonPath } from "@/lib/json-location";
import { findYamlPathAtLine, findLineForYamlPath } from "@/lib/yaml-location";

interface Props {
  tab: EditorTab;
}

export function JsonYamlPanel({ tab }: Props) {
  const [cursorLine, setCursorLine] = useState(1);
  const editorBinding = useRef<MonacoEditorBinding | null>(null);
  const updateContent = useEditorStore((s) => s.updateContent);
  const toggleTreeSyncLinked = useEditorStore((s) => s.toggleTreeSyncLinked);
  const syncLinked = tab.treeSyncLinked !== false;

  const activePath = useMemo(() => {
    if (!syncLinked) return null;
    if (tab.language === "json") return findJsonPathAtLine(tab.content, cursorLine);
    if (tab.language === "yaml") return findYamlPathAtLine(tab.content, cursorLine);
    return null;
  }, [tab.content, tab.language, cursorLine, syncLinked]);

  const handlePathSelect = (path: JsonPath) => {
    if (!syncLinked || path.length === 0) return;
    const line =
      tab.language === "json"
        ? findLineForJsonPath(tab.content, path)
        : findLineForYamlPath(tab.content, path);
    if (line) editorBinding.current?.revealLine(line);
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[1fr_280px] divide-x divide-border">
      <div className="min-h-0 overflow-hidden">
        <MonacoEditor
          tab={tab}
          onCursorLineChange={setCursorLine}
          bindEditor={(api) => {
            editorBinding.current = api;
          }}
        />
      </div>
      <div className="min-h-0 overflow-hidden">
        <TreeView
          content={tab.content}
          language={tab.language as "json" | "yaml"}
          activePath={activePath}
          syncLinked={syncLinked}
          onToggleSync={() => toggleTreeSyncLinked(tab.id)}
          onPathSelect={handlePathSelect}
          onFormat={(s) => updateContent(tab.id, s)}
        />
      </div>
    </div>
  );
}
