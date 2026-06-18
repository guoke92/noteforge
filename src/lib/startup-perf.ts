/**
 * Fine-grained startup / load timing logs.
 *
 * Enabled when:
 * - `import.meta.env.DEV`, or
 * - `localStorage.noteforge:perf === "1"`
 *
 * Filter console: `NoteForge:perf`
 */

const PREFIX = "NoteForge:perf";
const STORAGE_KEY = "noteforge:perf";

let originMs = 0;
let depth = 0;
let bootstrapping = false;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function isPerfLoggingEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPerfLoggingEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Call once at app entry (main.tsx). */
export function perfMarkBootOrigin(label = "app-entry"): void {
  originMs = now();
  bootstrapping = true;
  perfLog(`origin · ${label}`);
}

export function perfMarkBootComplete(): void {
  if (!bootstrapping) return;
  bootstrapping = false;
  perfLog("bootstrap pipeline finished (splash may still be visible)");
}

function indent(): string {
  return depth > 0 ? `${"  ".repeat(depth)}` : "";
}

function formatExtra(extra?: Record<string, unknown>): string {
  if (!extra || Object.keys(extra).length === 0) return "";
  const parts = Object.entries(extra)
    .map(([k, v]) => {
      if (typeof v === "number") {
        return k === "ms" || k.endsWith("Ms") ? `${k}=${Math.round(v)}ms` : `${k}=${v}`;
      }
      if (v === undefined || v === null) return "";
      if (typeof v === "string" && v.length > 80) return `${k}="${v.slice(0, 77)}…"`;
      return `${k}=${JSON.stringify(v)}`;
    })
    .filter(Boolean);
  return parts.length ? ` {${parts.join(", ")}}` : "";
}

export function perfLog(message: string, extra?: Record<string, unknown>): void {
  if (!isPerfLoggingEnabled()) return;
  const sinceOrigin = Math.round(now() - originMs);
  console.info(`${PREFIX} +${sinceOrigin}ms ${indent()}${message}${formatExtra(extra)}`);
}

export function perfStart(name: string, extra?: Record<string, unknown>): () => number {
  if (!isPerfLoggingEnabled()) {
    return () => 0;
  }
  const t0 = now();
  depth += 1;
  perfLog(`▶ ${name}`, extra);
  let ended = false;
  return () => {
    if (ended) return 0;
    ended = true;
    depth = Math.max(0, depth - 1);
    const ms = now() - t0;
    perfLog(`✓ ${name}`, { ms });
    return ms;
  };
}

export function perfSync<T>(name: string, fn: () => T, extra?: Record<string, unknown>): T {
  if (!isPerfLoggingEnabled()) return fn();
  const end = perfStart(name, extra);
  try {
    return fn();
  } finally {
    end();
  }
}

export async function perfAsync<T>(
  name: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>,
): Promise<T> {
  if (!isPerfLoggingEnabled()) return fn();
  const end = perfStart(name, extra);
  try {
    return await fn();
  } finally {
    end();
  }
}

/** Fire-and-forget async work with duration log on completion. */
export function perfAsyncDetached(name: string, fn: () => Promise<void>): void {
  if (!isPerfLoggingEnabled()) {
    void fn();
    return;
  }
  const end = perfStart(name);
  void fn()
    .catch((err) => {
      perfLog(`✗ ${name}`, { error: err instanceof Error ? err.message : String(err) });
    })
    .finally(() => {
      end();
    });
}
