import type { DocumentId, VaultPath } from "../events";
import type { EditorSurfaceMode, ViewState } from "../document/types";

export type PaneId = string;

export interface TabDescriptor {
  documentId: DocumentId;
  pinned?: boolean;
  order: number;
}

export interface PaneState {
  id: PaneId;
  tabs: TabDescriptor[];
  activeDocumentId: DocumentId | null;
  widthRatio?: number;
}

export interface LayoutState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  rightPanelMode: "outline" | "backlinks" | "properties" | "graph" | "ai";
}

export interface PersistedEphemeralSnapshot {
  title: string;
  content: string;
  language: string;
  viewState: ViewState;
}

/** Serializable tab reference — uses vaultPath or scratchId, not runtime documentId. */
export interface PersistedTabRef {
  vaultPath: VaultPath | null;
  /** Stable scratch buffer id (Layer A). Content loaded from scratch store on restore. */
  scratchId?: string;
  order: number;
  pinned?: boolean;
  viewState?: ViewState;
  /** @deprecated v2 inline snapshot — migrate to scratchId + scratch buffer */
  ephemeral?: PersistedEphemeralSnapshot;
}

export interface PersistedPane {
  id: PaneId;
  tabs: PersistedTabRef[];
  activeTabIndex: number;
}

/** ADR-006: Full workspace session including workspace files and layout. */
export interface WorkspaceSession {
  version: 2;
  vaultId: string;
  vaultRootPath: string;
  savedAt: string;
  layout: LayoutState;
  panes: PersistedPane[];
  activePaneId: PaneId;
}

export interface WorkbenchState {
  panes: PaneState[];
  activePaneId: PaneId;
  layout: LayoutState;
  sessionRestored: boolean;
}

export function normalizeSurfaceMode(mode?: string): EditorSurfaceMode {
  if (mode === "source" || mode === "edit") return "source";
  if (mode === "read" || mode === "preview") return "read";
  if (mode === "write" || mode === "live" || mode === "split") return "write";
  return "write";
}

