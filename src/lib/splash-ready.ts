import { useStartupStore } from "@/store/startup";

let resolveMainShellReady: (() => void) | null = null;
let readyPromise: Promise<void> | null = null;

/** Reset gate between dev HMR/full reload cycles. */
export function resetMainShellReadyGate(): void {
  resolveMainShellReady = null;
  readyPromise = null;
  useStartupStore.setState({ mainShellReady: false });
}

export function waitForMainShellReady(timeoutMs = 8000): Promise<void> {
  if (useStartupStore.getState().mainShellReady) {
    return Promise.resolve();
  }
  if (!readyPromise) {
    readyPromise = new Promise<void>((resolve) => {
      resolveMainShellReady = resolve;
    });
  }
  return Promise.race([
    readyPromise,
    new Promise<void>((resolve) => {
      setTimeout(() => {
        if (!useStartupStore.getState().mainShellReady) {
          console.warn("waitForMainShellReady timed out — forcing continue");
          signalMainShellReady();
        }
        resolve();
      }, timeoutMs);
    }),
  ]);
}

export function signalMainShellReady(): void {
  if (useStartupStore.getState().mainShellReady) {
    resolveMainShellReady?.();
    resolveMainShellReady = null;
    readyPromise = null;
    return;
  }
  useStartupStore.setState({ mainShellReady: true });
  resolveMainShellReady?.();
  resolveMainShellReady = null;
  readyPromise = null;
}

/** Yield until React has committed pending state updates. */
export function afterReactCommit(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** Wait for two animation frames so layout/paint can settle. */
export function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
