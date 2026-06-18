import { useThemeStore } from "@/store/theme";
import { useAIStore } from "@/store/ai";
import { useStartupStore } from "@/store/startup";
import { useEditorStore } from "@/store/editor";
import { loadWorkspaceSession } from "@/core/workbench/session-storage";
import { getCore, restoreWorkspaceSession } from "@/core/runtime";
import { showAppWindow } from "@/lib/app-window";
import { ensureMonacoSetup } from "@/lib/ensure-monaco-setup";
import {
  afterNextPaint,
  afterReactCommit,
  resetMainShellReadyGate,
  waitForMainShellReady,
} from "@/lib/splash-ready";
import { perfAsync, perfLog, perfMarkBootComplete, perfStart } from "@/lib/startup-perf";

function normalizeVaultPath(path: string): string {
  return path.replace(/\/+$/, "");
}

const MIN_SPLASH_MS = 650;

let bootstrapPromise: Promise<void> | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dismissSplash(startedAt: number): Promise<void> {
  const end = perfStart("splash.dismiss");
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_SPLASH_MS) {
    const wait = MIN_SPLASH_MS - elapsed;
    perfLog("splash.wait-min-duration", { wait });
    await delay(wait);
  }

  useStartupStore.getState().markBootstrapComplete();
  perfLog("splash.main-shell.mount-requested");
  await afterReactCommit();
  await waitForMainShellReady();
  perfLog("splash.main-shell.painted");

  await perfAsync("splash.preload-monaco", () => ensureMonacoSetup());

  useStartupStore.getState().finishStartup();
  perfLog("splash.reveal-main-shell");
  await afterNextPaint();
  await showAppWindow();
  perfLog("splash.hidden");
  end();
  perfMarkBootComplete();
}

/** Idempotent startup: theme → vault → session restore (sequential). */
export function startAppBootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    resetMainShellReadyGate();
    bootstrapPromise = (async () => {
      const startup = useStartupStore.getState();
      const startedAt = Date.now();
      const endBootstrap = perfStart("bootstrap.total");

      startup.setActiveStep("theme");
      await perfAsync("bootstrap.theme.init", () => useThemeStore.getState().init());
      startup.completeStep("theme");

      startup.setActiveStep("workspace");
      const saved = await perfAsync("bootstrap.session.load-json", () => loadWorkspaceSession());
      perfLog("bootstrap.session.loaded", {
        hasSession: !!saved,
        tabPanes: saved?.panes?.length ?? 0,
        vaultRoot: saved?.vaultRootPath ?? "",
      });

      const recent = await perfAsync("bootstrap.vault.list-recent", () => getCore().vault.listRecent());
      const vaultToOpen =
        saved?.vaultRootPath?.trim() ||
        recent[0]?.rootPath ||
        "";
      perfLog("bootstrap.vault.resolve-path", { vaultToOpen: vaultToOpen || "(none)" });

      if (vaultToOpen) {
        await perfAsync("bootstrap.vault.open", () =>
          getCore().vault.open(normalizeVaultPath(vaultToOpen)),
        );
      } else {
        perfLog("bootstrap.vault.open skipped (no path)");
      }
      startup.completeStep("workspace");

      startup.setActiveStep("session");
      const restored = await perfAsync("bootstrap.session.restore", () =>
        restoreWorkspaceSession(saved),
      );
      perfLog("bootstrap.session.restore-result", {
        restored,
        tabCount: useEditorStore.getState().tabs.length,
        sessionRestored: useEditorStore.getState().sessionRestored,
      });
      if (!useEditorStore.getState().sessionRestored) {
        useEditorStore.setState({ sessionRestored: true });
      }
      startup.completeStep("session");

      perfLog("bootstrap.ai.load-models (detached)");
      void useAIStore.getState().loadModels();

      await dismissSplash(startedAt);
      endBootstrap();
    })().catch(async (err) => {
      console.error("App bootstrap failed", err);
      perfLog("bootstrap.failed", { error: err instanceof Error ? err.message : String(err) });
      useEditorStore.setState({ sessionRestored: true });
      useStartupStore.getState().completeStep("theme");
      useStartupStore.getState().completeStep("workspace");
      useStartupStore.getState().completeStep("session");
      await dismissSplash(Date.now());
    });
  }
  return bootstrapPromise;
}
