import { useMemo, useRef, useState } from "react";
import type { EditorTab } from "@/store/editor";
import { useEditorStore } from "@/store/editor";
import { useDocumentRecord } from "@/hooks/useDocumentContent";
import { MonacoEditor, type MonacoEditorBinding } from "./MonacoEditor";
import { TreeView } from "@/features/json-yaml/TreeView";
import { findJsonPathAtLine, findLineForJsonPath, type JsonPath } from "@/lib/json-location";
import { findYamlPathAtLine, findLineForYamlPath } from "@/lib/yaml-location";

import { applyContentToDocument } from "@/core/bridge/editor-sync";

interface Props {
  tab: EditorTab;
}

export function JsonYamlPanel({ tab }: Props) {
  const [cursorLine, setCursorLine] = useState(1);
  const editorBinding = useRef<MonacoEditorBinding | null>(null);
  const toggleTreeSyncLinked = useEditorStore((s) => s.toggleTreeSyncLinked);
  const syncLinked = tab.treeSyncLinked !== false;
  const doc = useDocumentRecord(tab.documentId);
  const docContent = doc?.content ?? "";
  const tier = doc?.tier ?? "normal";

  const activePath = useMemo(() => {
    if (!syncLinked) return null;
    if (tab.language === "json") return findJsonPathAtLine(docContent, cursorLine);
    if (tab.language === "yaml") return findYamlPathAtLine(docContent, cursorLine);
    return null;
  }, [docContent, tab.language, cursorLine, syncLinked]);

  const handlePathSelect = (path: JsonPath) => {
    if (!syncLinked || path.length === 0) return;
    const line =
      tab.language === "json"
        ? findLineForJsonPath(docContent, path)
        : findLineForYamlPath(docContent, path);
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
          documentId={tab.documentId}
          tier={tier}
          content={docContent}
          language={tab.language as "json" | "yaml"}
          activePath={activePath}
          syncLinked={syncLinked}
          onToggleSync={() => toggleTreeSyncLinked(tab.id)}
          onPathSelect={handlePathSelect}
          onFormat={(formatted) => applyContentToDocument(tab.documentId, formatted)}
        />
      </div>
    </div>
  );
}
