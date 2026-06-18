import { useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  STARTUP_STEP_LABELS,
  STARTUP_STEP_ORDER,
  startupProgress,
  useStartupStore,
  type StartupStep,
} from "@/store/startup";
import { NoteForgeLogo } from "./NoteForgeLogo";

function StepIcon({ done, active }: { done: boolean; active: boolean }) {
  if (done) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-success">
        <Check size={12} strokeWidth={2.5} />
      </span>
    );
  }
  if (active) {
    return (
      <span className="flex h-5 w-5 items-center justify-center text-accent">
        <Loader2 size={14} className="animate-spin" />
      </span>
    );
  }
  return <span className="h-5 w-5 rounded-full border border-border bg-bg-tertiary/60" />;
}

function StepRow({ step, done, active }: { step: StartupStep; done: boolean; active: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 text-sm transition-colors ${
        done ? "text-text-secondary" : active ? "text-text-primary" : "text-text-tertiary"
      }`}
    >
      <StepIcon done={done} active={active} />
      <span>{STARTUP_STEP_LABELS[step]}</span>
    </li>
  );
}

export function AppSplashScreen() {
  const stepsDone = useStartupStore((s) => s.stepsDone);
  const activeStep = useStartupStore((s) => s.activeStep);
  const progress = startupProgress(stepsDone);

  useEffect(() => {
    document.getElementById("static-boot-splash")?.remove();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="NoteForge 正在启动"
    >
      <div className="absolute inset-0 bg-bg-primary" />
      <div className="splash-grid absolute inset-0 opacity-[0.35]" aria-hidden />

      <div className="relative flex w-full max-w-md flex-col items-center px-8">
        <NoteForgeLogo size={80} />

        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-text-primary">
          NoteForge
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Knowledge for humans and AI agents
        </p>

        <div className="mt-10 w-full">
          <div className="h-1 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
              style={{ width: `${Math.max(8, progress * 100)}%` }}
            />
          </div>

          <ul className="mt-5 space-y-2.5">
            {STARTUP_STEP_ORDER.map((step) => (
              <StepRow
                key={step}
                step={step}
                done={stepsDone[step]}
                active={activeStep === step && !stepsDone[step]}
              />
            ))}
          </ul>
        </div>

        <p className="mt-8 text-xs text-text-tertiary">
          {stepsDone.workspace
            ? "即将进入工作区…"
            : `${STARTUP_STEP_LABELS[activeStep]}…`}
        </p>
      </div>
    </div>
  );
}
