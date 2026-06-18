import { create } from "zustand";

export type StartupStep = "theme" | "session" | "workspace";

export const STARTUP_STEP_ORDER: StartupStep[] = ["theme", "session", "workspace"];

export const STARTUP_STEP_LABELS: Record<StartupStep, string> = {
  theme: "初始化界面",
  session: "恢复编辑会话",
  workspace: "加载知识库",
};

interface StartupState {
  stepsDone: Record<StartupStep, boolean>;
  activeStep: StartupStep;
  /** Bootstrap finished — mount main shell behind splash. */
  bootstrapComplete: boolean;
  /** Main shell mounted and painted at least once. */
  mainShellReady: boolean;
  /** Main workbench visible to the user (after splash). */
  mainShellRevealed: boolean;
  splashVisible: boolean;
  fading: boolean;
  setActiveStep: (step: StartupStep) => void;
  completeStep: (step: StartupStep) => void;
  markBootstrapComplete: () => void;
  finishStartup: () => void;
  beginFadeOut: () => void;
  hideSplash: () => void;
}

export const useStartupStore = create<StartupState>((set, get) => ({
  stepsDone: { theme: false, session: false, workspace: false },
  activeStep: "theme",
  bootstrapComplete: false,
  mainShellReady: false,
  mainShellRevealed: false,
  splashVisible: true,
  fading: false,

  setActiveStep(step) {
    set({ activeStep: step });
  },

  completeStep(step) {
    const stepsDone = { ...get().stepsDone, [step]: true };
    const next = STARTUP_STEP_ORDER.find((s) => !stepsDone[s]);
    set({
      stepsDone,
      activeStep: next ?? step,
    });
  },

  markBootstrapComplete() {
    set({ bootstrapComplete: true });
  },

  finishStartup() {
    set({ splashVisible: false, mainShellRevealed: true, fading: false });
  },

  beginFadeOut() {
    set({ fading: true });
  },

  hideSplash() {
    set({ splashVisible: false, fading: false });
  },
}));

export function startupProgress(stepsDone: Record<StartupStep, boolean>): number {
  const done = STARTUP_STEP_ORDER.filter((s) => stepsDone[s]).length;
  return done / STARTUP_STEP_ORDER.length;
}
