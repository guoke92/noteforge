import { isTauri, workbenchSession } from "@/ipc";
import type { WorkspaceSession } from "./types";

const SESSION_V2_KEY = "noteforge:session:v2";

function parseSession(raw: string): WorkspaceSession | null {
  try {
    const parsed = JSON.parse(raw) as WorkspaceSession;
    if (parsed.version !== 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function loadRawSession(): Promise<string | null> {
  if (isTauri()) {
    const fromDisk = await workbenchSession.load();
    if (fromDisk) return fromDisk;

    const legacy = localStorage.getItem(SESSION_V2_KEY);
    if (legacy) {
      try {
        await workbenchSession.save(legacy);
        localStorage.removeItem(SESSION_V2_KEY);
      } catch {
        /* keep legacy in localStorage as fallback */
      }
      return legacy;
    }
    return null;
  }

  return localStorage.getItem(SESSION_V2_KEY);
}

async function saveRawSession(raw: string | null): Promise<void> {
  if (isTauri()) {
    await workbenchSession.save(raw);
    if (raw === null) {
      localStorage.removeItem(SESSION_V2_KEY);
    }
    return;
  }

  try {
    if (!raw) {
      localStorage.removeItem(SESSION_V2_KEY);
      return;
    }
    localStorage.setItem(SESSION_V2_KEY, raw);
  } catch {
    /* ignore quota errors */
  }
}

export async function loadWorkspaceSession(): Promise<WorkspaceSession | null> {
  try {
    const raw = await loadRawSession();
    if (!raw) return null;
    return parseSession(raw);
  } catch {
    return null;
  }
}

export async function saveWorkspaceSession(session: WorkspaceSession | null): Promise<void> {
  try {
    const raw = session ? JSON.stringify(session) : null;
    await saveRawSession(raw);
  } catch (e) {
    console.error("saveWorkspaceSession failed", e);
  }
}

/** Migrate legacy scratch session if v2 missing. */
export async function loadLegacyScratchSession(): Promise<{
  panes: string[];
  activePaneId: string;
  activeTabIdByPane: Record<string, string | undefined>;
  scratchTabs: Array<{
    tabId: string;
    scratchId: string;
    displayName: string;
    language: string;
    paneId: string;
    previewMode?: string;
    content: string;
  }>;
} | null> {
  try {
    const { scratch } = await import("@/ipc");
    const { session, buffers } = await scratch.restoreSession();
    if (!session?.tabs?.length) return null;
    const bufferById = new Map(buffers.map((b) => [b.scratchId, b]));
    return {
      panes: session.panes.length ? session.panes : ["pane-1"],
      activePaneId: session.activePaneId || "pane-1",
      activeTabIdByPane: session.activeTabIdByPane,
      scratchTabs: session.tabs.map((meta) => {
        const buf = bufferById.get(meta.scratchId);
        return {
          tabId: meta.tabId,
          scratchId: meta.scratchId,
          displayName: meta.displayName,
          language: meta.language,
          paneId: meta.paneId,
          previewMode: meta.previewMode,
          content: buf?.content ?? "",
        };
      }),
    };
  } catch {
    return null;
  }
}

export async function clearLegacyScratchSession(): Promise<void> {
  try {
    const { scratch } = await import("@/ipc");
    await scratch.clearSession();
  } catch {
    /* ignore */
  }
}
