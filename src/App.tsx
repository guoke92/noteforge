import { useEffect } from "react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { EditorArea } from "@/components/editor/EditorArea";
import { StatusBar } from "@/components/editor/StatusBar";
import { ProblemsPanel } from "@/components/editor/ProblemsPanel";
import { RightPanel } from "@/components/right/RightPanel";
import { TopBar } from "@/components/topbar/TopBar";
import { GlobalSearchDialog } from "@/components/dialogs/GlobalSearchDialog";
import { ImportWizardDialog } from "@/components/dialogs/ImportWizardDialog";
import { NewMemoryDialog } from "@/components/dialogs/NewMemoryDialog";
import { SettingsDialog } from "@/components/dialogs/SettingsDialog";
import { OnboardingDialog } from "@/components/dialogs/OnboardingDialog";
import { DialogHost } from "@/components/dialogs/DialogHost";
import { CommandPaletteDialog } from "@/components/dialogs/CommandPaletteDialog";
import { Resizer } from "@/components/ui/Resizer";
import { useUIStore } from "@/store/ui";
import { useGlobalShortcuts } from "@/hooks/useShortcuts";
import { useFileDrop } from "@/hooks/useFileDrop";
import { FileDropOverlay } from "@/components/editor/FileDropOverlay";
import { useEditorStore } from "@/store/editor";
import { AppSplashScreen } from "@/components/splash/AppSplashScreen";
import { useStartupStore } from "@/store/startup";
import { isTauri } from "@/ipc";
import { afterNextPaint, signalMainShellReady } from "@/lib/splash-ready";
import { perfLog } from "@/lib/startup-perf";

/** Full workbench — mounts behind splash, revealed when startup finishes. */
function MainWorkbench() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const rightOpen = useUIStore((s) => s.rightOpen);
  const rightWidth = useUIStore((s) => s.rightWidth);
  const setRightWidth = useUIStore((s) => s.setRightWidth);
  const flushBeforeExit = useEditorStore((s) => s.flushBeforeExit);
  const splashVisible = useStartupStore((s) => s.splashVisible);
  const fileDropActive = useFileDrop(!splashVisible);

  useGlobalShortcuts();

  useEffect(() => {
    let cancelled = false;
    perfLog("splash.main-shell.mount");
    void afterNextPaint().then(() => {
      if (cancelled) return;
      perfLog("splash.main-shell.paint-ready");
      signalMainShellReady();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isTauri()) return;

    const onHide = () => {
      void flushBeforeExit();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void flushBeforeExit();
      }
    };
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushBeforeExit]);

  return (
    <>
      <div
        className="flex h-screen w-screen flex-col overflow-hidden bg-bg-primary text-text-primary"
        aria-hidden={splashVisible}
      >
        <TopBar />

        <main className="relative flex min-h-0 flex-1">
          <FileDropOverlay active={fileDropActive} />
          {sidebarOpen && (
            <>
              <div style={{ width: sidebarWidth }} className="h-full shrink-0 overflow-hidden">
                <Sidebar />
              </div>
              <Resizer position="right" onResize={(d) => setSidebarWidth(sidebarWidth + d)} />
            </>
          )}

          <div className="flex h-full min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              <EditorArea />
            </div>
            <ProblemsPanel />
          </div>

          {rightOpen && (
            <>
              <Resizer position="left" onResize={(d) => setRightWidth(rightWidth + d)} />
              <div style={{ width: rightWidth }} className="h-full shrink-0 overflow-hidden">
                <RightPanel />
              </div>
            </>
          )}
        </main>

        <StatusBar />

        <GlobalSearchDialog />
        <ImportWizardDialog />
        <NewMemoryDialog />
        <SettingsDialog />
        <OnboardingDialog />
        <CommandPaletteDialog />
      </div>

      <div className="relative z-[210]">
        <DialogHost />
      </div>
    </>
  );
}

export function App() {
  const bootstrapComplete = useStartupStore((s) => s.bootstrapComplete);
  const splashVisible = useStartupStore((s) => s.splashVisible);

  return (
    <>
      {bootstrapComplete ? <MainWorkbench /> : null}
      {splashVisible ? <AppSplashScreen /> : null}
    </>
  );
}
