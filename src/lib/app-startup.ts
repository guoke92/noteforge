import { useThemeStore } from "@/store/theme";
import { useAIStore } from "@/store/ai";
import { useStartupStore } from "@/store/startup";
import { useEditorStore } from "@/store/editor";
import { loadWorkspaceSession } from "@/core/workbench/session-storage";
import { getCore, restoreWorkspaceSession } from "@/core/runtime";

function normalizeVaultPath(path: string): string {
  return path.replace(/\/+$/, "");
}

const MIN_SPLASH_MS = 650;
const FADE_OUT_MS = 380;

let bootstrapPromise: Promise<void> | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dismissSplash(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_SPLASH_MS) {
    await delay(MIN_SPLASH_MS - elapsed);
  }
  useStartupStore.getState().beginFadeOut();
  await delay(FADE_OUT_MS);
  useStartupStore.getState().hideSplash();
}

/** Idempotent startup: theme → vault → session restore (sequential). */
export function startAppBootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const startup = useStartupStore.getState();
      const startedAt = Date.now();

      startup.setActiveStep("theme");
      await useThemeStore.getState().init();
      startup.completeStep("theme");

      startup.setActiveStep("workspace");
      const saved = await loadWorkspaceSession();
      const recent = await getCore().vault.listRecent();
      const vaultToOpen =
        saved?.vaultRootPath?.trim() ||
        recent[0]?.rootPath ||
        "";
      if (vaultToOpen) {
        await getCore().vault.open(normalizeVaultPath(vaultToOpen));
      }
      startup.completeStep("workspace");

      startup.setActiveStep("session");
      await restoreWorkspaceSession();
      if (!useEditorStore.getState().sessionRestored) {
        useEditorStore.setState({ sessionRestored: true });
      }
      startup.completeStep("session");

      void useAIStore.getState().loadModels();

      await dismissSplash(startedAt);
    })().catch(async (err) => {
      console.error("App bootstrap failed", err);
      useEditorStore.setState({ sessionRestored: true });
      useStartupStore.getState().completeStep("theme");
      useStartupStore.getState().completeStep("workspace");
      useStartupStore.getState().completeStep("session");
      await dismissSplash(Date.now());
    });
  }
  return bootstrapPromise;
}
