/** Lazy-load Monaco workers/config — after splash, not on critical startup path. */
let setupPromise: Promise<void> | null = null;

export function ensureMonacoSetup(): Promise<void> {
  if (!setupPromise) {
    setupPromise = import("@/lib/monaco-setup").then(() => undefined);
  }
  return setupPromise;
}
