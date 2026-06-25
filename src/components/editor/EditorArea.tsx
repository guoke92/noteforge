import { Suspense, useEffect, useMemo, useState } from "react";
import { useEditorStore } from "@/store/editor";
import type { EditorTab } from "@/store/editor";
import { LargeFilePreview } from "./LargeFilePreview";
import { TabBar } from "./TabBar";
import { EditorStartupPlaceholder } from "./EditorStartupPlaceholder";
import { WelcomeView } from "@/features/welcome/WelcomeView";
import { ensureDocumentContentLoaded, getCore } from "@/core/runtime";
import { hydrateDeferredTab } from "@/core/bridge/editor-sync";
import { ensureMonacoSetup } from "@/lib/ensure-monaco-setup";
import { useDocumentRecord } from "@/hooks/useDocumentContent";
import { perfLog } from "@/lib/startup-perf";
import { useStartupStore } from "@/store/startup";
import { resolveEditorSurface } from "@/core/editor/surface-registry";
import { TabStripApiContext, type TabStripApi } from "@/contexts/tab-strip-api";

interface PaneProps {
  paneId: string;
}

function EditorSurfacePlaceholder() {
  return <div className="h-full bg-bg-primary" />;
}

function TabHydratingPlaceholder({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center text-text-secondary">
      <div className="text-center">
        <div className="mb-2 text-lg">正在打开 {name}…</div>
        <div className="text-sm opacity-60">首次切换到此标签时需要加载文件</div>
      </div>
    </div>
  );
}

function ActiveContent({ tab }: { tab: EditorTab }) {
  const doc = useDocumentRecord(tab.documentId);
  const splashVisible = useStartupStore((s) => s.splashVisible);
  const [forcing, setForcing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(Boolean(tab.pendingRestore));
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    if (splashVisible) {
      setEditorReady(false);
      return;
    }
    let cancelled = false;
    void ensureMonacoSetup().then(() => {
      if (!cancelled) setEditorReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [splashVisible]);

  useEffect(() => {
    if (splashVisible || !tab.pendingRestore) {
      if (!tab.pendingRestore) setHydrating(false);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    perfLog("editor.tab.hydrate.start", { tabId: tab.id, name: tab.displayName });
    void hydrateDeferredTab(tab.id)
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHydrating(false);
          perfLog("editor.tab.hydrate.end", { tabId: tab.id });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab.id, tab.pendingRestore, splashVisible]);

  const resolvedDoc = doc ?? getCore().document.get(tab.documentId);

  const Surface = useMemo(() => {
    if (!resolvedDoc) return null;
    return resolveEditorSurface(tab, resolvedDoc);
  }, [tab, resolvedDoc]);

  if (splashVisible || !editorReady) {
    return <EditorSurfacePlaceholder />;
  }

  if (tab.pendingRestore || hydrating) {
    return (
      <>
        {loadError ? (
          <div className="bg-red-500/10 px-4 py-2 text-sm text-red-500">{loadError}</div>
        ) : null}
        <TabHydratingPlaceholder name={tab.displayName} />
      </>
    );
  }

  if (!resolvedDoc) {
    return <EditorSurfacePlaceholder />;
  }

  if (resolvedDoc.tier === "huge" && !resolvedDoc.contentLoaded) {
    return (
      <LargeFilePreview
        tab={tab}
        forcing={forcing}
        loadError={loadError}
        onForceEdit={async () => {
          setLoadError(null);
          setForcing(true);
          try {
            await ensureDocumentContentLoaded(tab.documentId);
          } catch (err) {
            setLoadError(err instanceof Error ? err.message : String(err));
          } finally {
            setForcing(false);
          }
        }}
      />
    );
  }

  if (!Surface) {
    return <EditorSurfacePlaceholder />;
  }

  return (
    <Suspense fallback={<EditorSurfacePlaceholder />}>
      <Surface tab={tab} doc={resolvedDoc} />
    </Suspense>
  );
}

export function EditorPane({ paneId }: PaneProps) {
  const allTabs = useEditorStore((s) => s.tabs);
  const sessionRestored = useEditorStore((s) => s.sessionRestored);
  const tabs = allTabs.filter((t) => t.paneId === paneId);
  const activeId = useEditorStore((s) => s.activeTabIdByPane[paneId]);
  const setActivePane = useEditorStore((s) => s.setActivePane);
  const tab = tabs.find((t) => t.id === activeId) || tabs[0];
  const [tabStripApi, setTabStripApi] = useState<TabStripApi | null>(null);

  return (
    <TabStripApiContext.Provider value={tabStripApi}>
      <div
        className="flex h-full min-w-0 flex-1 flex-col"
        onClick={() => setActivePane(paneId)}
      >
        <TabBar paneId={paneId} onApiReady={setTabStripApi} />
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
    </TabStripApiContext.Provider>
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
