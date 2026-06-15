import { useEditorStore } from "@/store/editor";
import type { EditorTab } from "@/store/editor";
import { MonacoEditor } from "./MonacoEditor";
import { MarkdownPanel } from "@/features/markdown/MarkdownPanel";
import { JsonYamlPanel } from "./JsonYamlPanel";
import { TabBar } from "./TabBar";
import { EditorStartupPlaceholder } from "./EditorStartupPlaceholder";
import { WelcomeView } from "@/features/welcome/WelcomeView";
import { isMarkdownTab } from "@/lib/editor-doc";

interface PaneProps {
  paneId: string;
}

function ActiveContent({ tab }: { tab: EditorTab }) {
  if (isMarkdownTab(tab)) {
    return <MarkdownPanel tab={tab} />;
  }

  if (tab.language === "json" || tab.language === "yaml") {
    return <JsonYamlPanel tab={tab} />;
  }

  return <MonacoEditor tab={tab} />;
}

export function EditorPane({ paneId }: PaneProps) {
  const allTabs = useEditorStore((s) => s.tabs);
  const sessionRestored = useEditorStore((s) => s.sessionRestored);
  const tabs = allTabs.filter((t) => t.paneId === paneId);
  const activeId = useEditorStore((s) => s.activeTabIdByPane[paneId]);
  const setActivePane = useEditorStore((s) => s.setActivePane);
  const tab = tabs.find((t) => t.id === activeId) || tabs[0];

  return (
    <div
      className="flex h-full min-w-0 flex-1 flex-col"
      onClick={() => setActivePane(paneId)}
    >
      <TabBar paneId={paneId} />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {!sessionRestored ? (
          <EditorStartupPlaceholder />
        ) : tab ? (
          <ActiveContent key={tab.id} tab={tab} />
        ) : (
          <WelcomeView />
        )}
      </div>
    </div>
  );
}

export function EditorArea() {
  const panes = useEditorStore((s) => s.panes);
  return (
    <div className="flex h-full min-w-0 flex-1 divide-x divide-border bg-bg-primary">
      {panes.map((paneId) => (
        <div key={paneId} className="flex h-full min-w-0 flex-1">
          <EditorPane paneId={paneId} />
        </div>
      ))}
    </div>
  );
}
