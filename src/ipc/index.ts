// =====================================================================
//  IPC bridge — single entry point for every backend call.
//
//  Strategy: if `window.__TAURI_INTERNALS__` is present we call the
//  real Tauri `invoke`; otherwise we delegate to the stub layer that
//  serves mock data so the UI can be developed/tested in a browser.
//
//  The backend engineer simply implements the corresponding Tauri
//  commands; no frontend change is required.
// =====================================================================

import type {
  AIRefineResult,
  AISuggestedLink,
  Agent,
  AppConfig,
  AppConfigBackend,
  Backlink,
  BacklinkBackend,
  CreateWorkspaceResult,
  FileBackendEntry,
  FileEntry,
  FileInfo,
  GraphEdge,
  GraphNode,
  GraphEdgeBackend,
  GraphNodeBackend,
  KnowledgeGraphBackend,
  LanguageDetection,
  Link,
  LinkBackend,
  MemoryBackendEntry,
  MemoryEntry,
  MemoryType,
  ModelInfo,
  OpenWorkspaceResult,
  SearchBackendResult,
  SearchResult,
  SemanticResult,
  TagCount,
  ThemeMode,
  WorkspaceConfig,
  WorkspaceView,
  ScratchBufferPayload,
  ScratchSessionPayload,
  ScratchRestoreResponse,
  WorkspaceDraftPayload,
} from "@/types";
import { IpcError } from "@/types";
import * as stub from "./stub";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  }
}

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.__TAURI_INTERNALS__ !== undefined || window.__TAURI__ !== undefined)
  );
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke(command, args)) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new IpcError("UNKNOWN", message, err);
  }
}

async function call<T>(
  command: string,
  args: Record<string, unknown>,
  stubFn: () => Promise<T>,
): Promise<T> {
  if (isTauri()) return tauriInvoke<T>(command, args);
  return stubFn();
}

/** Tauri commands that take `request: SomeRequest` as the first argument. */
function req<T extends Record<string, unknown>>(fields: T): { request: T } {
  return { request: fields };
}

/* ---------- Adapters: backend -> frontend ---------- */

function toWorkspaceView(id: string, config: {
  name: string;
  path: string;
  auto_index: boolean;
  exclude_patterns: string[];
}): WorkspaceView {
  return {
    id,
    name: config.name,
    path: config.path,
    autoIndex: config.auto_index,
    excludePatterns: config.exclude_patterns,
  };
}

function openResultToView(r: OpenWorkspaceResult): WorkspaceView {
  return toWorkspaceView(r.id, r.config);
}

function toMemoryEntry(m: MemoryBackendEntry): MemoryEntry {
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  return {
    id: m.id,
    agentId: m.agent_id,
    agentName: (meta.agentName as string) ?? undefined,
    title: m.title ?? (meta.title as string) ?? undefined,
    content: m.content,
    type: m.type as MemoryEntry["type"],
    importance: m.importance,
    metadata: m.metadata ?? undefined,
    tags: m.tags ?? (meta.tags as string[]) ?? undefined,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  };
}

function toFileEntry(f: FileBackendEntry): FileEntry {
  return {
    path: f.path,
    name: f.name,
    isDir: f.is_dir,
    size: f.size,
    modified: f.modified,
  };
}

function toSearchResult(r: SearchBackendResult): SearchResult {
  return {
    filePath: r.file_path,
    title: r.title,
    snippet: r.content,
    score: r.score,
  };
}

function toSemanticResult(r: SearchBackendResult): SemanticResult {
  return { ...toSearchResult(r), similarity: 0 };
}

function toGraphNode(n: GraphNodeBackend): GraphNode {
  return {
    id: n.id,
    label: (n.properties as Record<string, unknown>)?.label as string ?? n.id,
    type: "note",
    referenceId: n.reference_id,
    degree: (n.properties as Record<string, unknown>)?.degree as number ?? 0,
  };
}

function toGraphEdge(e: GraphEdgeBackend): GraphEdge {
  return {
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    type: "reference",
    weight: e.weight,
  };
}

function toLink(l: LinkBackend): Link {
  return {
    source: l.source_file,
    target: l.target_file,
    context: l.context ?? undefined,
    resolved: true,
  };
}

function toBacklink(b: BacklinkBackend): Backlink {
  return {
    sourceFile: b.source_file,
    sourceTitle: "",
    snippet: b.context ?? "",
  };
}

/* ============================================================
 *  Workspace
 * ============================================================ */
export const workspace = {
  create: async (name: string, path: string): Promise<WorkspaceView> => {
    const raw = await call<CreateWorkspaceResult>(
      "create_workspace",
      { request: { name, path } },
      () => stub.createWorkspace(name, path),
    );
    return { id: raw.id, name, path, autoIndex: true, excludePatterns: [] };
  },
  open: async (path: string): Promise<WorkspaceView> => {
    const raw = await call<OpenWorkspaceResult>(
      "open_workspace",
      { request: { path } },
      () => stub.openWorkspace(path),
    );
    return openResultToView(raw);
  },
  getConfig: (id: string) =>
    call<WorkspaceConfig>("get_workspace_config", { id }, () => stub.getWorkspaceConfig(id)),
  updateConfig: (id: string, config: Partial<WorkspaceConfig>) =>
    call<void>("update_workspace_config", { id, config }, () => stub.updateWorkspaceConfig(id, config)),
  list: () => call<WorkspaceConfig[]>("list_workspaces", {}, () => stub.listWorkspaces()),
};

/* ============================================================
 *  File system
 * ============================================================ */
export const fs = {
  read: (path: string) =>
    call<{ content: string; language: string }>("read_file", { path }, () => stub.readFile(path)),
  write: (path: string, content: string) =>
    call<void>("write_file", { path, content }, () => stub.writeFile(path, content)),
  list: async (path: string): Promise<FileEntry[]> => {
    const raw = await call<FileBackendEntry[]>("list_directory", { path }, () =>
      stub.listDirectory(path),
    );
    return raw.map(toFileEntry);
  },
  create: (path: string, content = "") =>
    call<void>("create_file", { path, content }, () => stub.createFile(path, content)),
  remove: (path: string) =>
    call<void>("delete_file", { path }, () => stub.deleteFile(path)),
  rename: (oldPath: string, newPath: string) =>
    call<void>("rename_file", { oldPath, newPath }, () => stub.renameFile(oldPath, newPath)),
  move: (source: string, destination: string) =>
    call<void>("move_file", { source, destination }, () => stub.moveFile(source, destination)),
  info: (path: string) => call<FileInfo>("get_file_info", { path }, () => stub.getFileInfo(path)),
};

/* ============================================================
 *  Scratch drafts (app data, not workspace)
 * ============================================================ */
export const scratch = {
  saveBuffer: (payload: ScratchBufferPayload) =>
    call<void>("scratch_save_buffer", { payload }, () => stub.scratchSaveBuffer(payload)),
  loadBuffer: (scratchId: string) =>
    call<ScratchBufferPayload | null>("scratch_load_buffer", { scratchId }, () =>
      stub.scratchLoadBuffer(scratchId),
    ),
  deleteBuffer: (scratchId: string) =>
    call<void>("scratch_delete_buffer", { scratchId }, () => stub.scratchDeleteBuffer(scratchId)),
  saveSession: (session: ScratchSessionPayload) =>
    call<void>("scratch_save_session", { session }, () => stub.scratchSaveSession(session)),
  restoreSession: () =>
    call<ScratchRestoreResponse>("scratch_restore_session", {}, () => stub.scratchRestoreSession()),
  clearSession: () => call<void>("scratch_clear_session", {}, () => stub.scratchClearSession()),
};

/* ============================================================
 *  Workspace file drafts (Layer A — autosave before disk save)
 * ============================================================ */
export const draft = {
  saveBuffer: (payload: WorkspaceDraftPayload) =>
    call<void>("draft_save_buffer", { payload }, () => stub.draftSaveBuffer(payload)),
  loadBuffer: (vaultPath: string) =>
    call<WorkspaceDraftPayload | null>("draft_load_buffer", { vaultPath }, () =>
      stub.draftLoadBuffer(vaultPath),
    ),
  deleteBuffer: (vaultPath: string) =>
    call<void>("draft_delete_buffer", { vaultPath }, () => stub.draftDeleteBuffer(vaultPath)),
};

/* ============================================================
 *  Workbench window session (Layer B — tab list, layout)
 * ============================================================ */
export const workbenchSession = {
  save: (session: string | null) =>
    call<void>("workbench_save_session", { session }, () => stub.workbenchSaveSession(session)),
  load: () =>
    call<string | null>("workbench_load_session", {}, () => stub.workbenchLoadSession()),
};

/* ============================================================
 *  Editor
 * ============================================================ */
export const editor = {
  detectLanguage: (content: string, filename?: string) =>
    call<LanguageDetection>("detect_language", { content, filename }, () =>
      stub.detectLanguage(content, filename),
    ),
  formatCode: (content: string, language: string) =>
    call<{ formatted: string }>("format_code", { content, language }, () =>
      stub.formatCode(content, language),
    ),
};

/* ============================================================
 *  Knowledge engine
 * ============================================================ */
export const knowledge = {
  indexWorkspace: (workspaceId: string, path: string) =>
    call<number>(
      "index_knowledge_base",
      req({ workspaceId, path }),
      () => stub.indexKnowledgeBase(workspaceId, path).then((r) => r.indexed),
    ),
  searchFulltext: async (workspaceId: string, query: string, limit = 30): Promise<SearchResult[]> => {
    const raw = await call<SearchBackendResult[]>(
      "search_fulltext",
      req({ workspaceId, query, limit }),
      () => stub.searchFulltext(workspaceId, query, limit),
    );
    return raw.map(toSearchResult);
  },
  semanticSearch: async (workspaceId: string, query: string, limit = 30): Promise<SemanticResult[]> => {
    const raw = await call<SearchBackendResult[]>(
      "semantic_search",
      req({ workspaceId, query, limit }),
      () => stub.semanticSearch(workspaceId, query, limit),
    );
    return raw.map(toSemanticResult);
  },
  getGraph: async (workspaceId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> => {
    const raw = await call<KnowledgeGraphBackend>("get_knowledge_graph", req({ workspaceId }), () =>
      stub.getKnowledgeGraph(workspaceId),
    );
    return {
      nodes: raw.nodes.map(toGraphNode),
      edges: raw.edges.map(toGraphEdge),
    };
  },
  extractLinks: async (content: string, filePath: string): Promise<Link[]> => {
    const raw = await call<LinkBackend[]>("extract_links", req({ content, filePath }), () =>
      stub.extractLinks(content, filePath),
    );
    return raw.map(toLink);
  },
  extractTags: (content: string) =>
    call<string[]>("extract_tags", req({ content }), () => stub.extractTags(content)),
  getBacklinks: async (filePath: string): Promise<Backlink[]> => {
    const raw = await call<BacklinkBackend[]>("get_backlinks", req({ filePath }), () =>
      stub.getBacklinks(filePath),
    );
    return raw.map(toBacklink);
  },
  getTags: (workspaceId: string) =>
    call<TagCount[]>("get_tags", req({ workspaceId }), () => stub.getTags(workspaceId)),
  filterByTags: async (workspaceId: string, tags: string[]): Promise<FileEntry[]> => {
    const raw = await call<FileBackendEntry[]>("filter_by_tags", req({ workspaceId, tags }), () =>
      stub.filterByTags(workspaceId, tags),
    );
    return raw.map(toFileEntry);
  },
};

/* ============================================================
 *  Agent memory
 * ============================================================ */
export const memory = {
  listAgents: () => call<Agent[]>("list_agents", {}, () => stub.listAgents()),
  list: async (agentId?: string, type?: MemoryType): Promise<MemoryEntry[]> => {
    const raw = await call<MemoryBackendEntry[]>(
      "list_agent_memories",
      req({ agentId: agentId ?? "", type }),
      () => stub.listMemories(agentId, type),
    );
    return raw.map(toMemoryEntry);
  },
  timeline: async (agentId?: string, startDate?: string, endDate?: string): Promise<MemoryEntry[]> => {
    const raw = await call<MemoryBackendEntry[]>(
      "get_memory_timeline",
      req({ agentId: agentId ?? "", startDate, endDate }),
      () => stub.getMemoryTimeline(agentId, startDate, endDate),
    );
    return raw.map(toMemoryEntry);
  },
  create: (
    agentId: string,
    content: string,
    type: MemoryType,
    title?: string,
    tags: string[] = [],
    workspaceId = "",
  ) =>
    call<string>("create_memory", req({ workspaceId, agentId, content, type, title, tags }), () =>
      stub.createMemory(agentId, content, type, title, tags).then((r) => r.id),
    ),
  update: (memoryId: string, content: string, metadata?: Record<string, unknown>) =>
    call<void>("update_memory", req({ memoryId, content, metadata }), () =>
      stub.updateMemory(memoryId, content, metadata),
    ),
  remove: (memoryId: string) =>
    call<void>("delete_memory", req({ memoryId }), () => stub.deleteMemory(memoryId)),
  batchTag: (memoryIds: string[], tags: string[]) =>
    call<void>("batch_tag_memories", req({ memoryIds, tags }), () =>
      stub.batchTagMemories(memoryIds, tags),
    ),
  batchDelete: (memoryIds: string[]) =>
    call<void>("batch_delete_memories", req({ memoryIds }), () =>
      stub.batchDeleteMemories(memoryIds),
    ),
  importFrom: (agentId: string, format: string, data: string, workspaceId = "") =>
    call<{ imported: number; errors: string[] }>(
      "import_agent_memories",
      req({ workspaceId, agentId, format, data }),
      () => stub.importAgentMemories(agentId, format, data),
    ),
  monitorDirectory: (agentId: string, path: string) =>
    call<string>("monitor_memory_directory", req({ agentId, path }), () =>
      stub.monitorMemoryDirectory(agentId, path).then((r) => r.watcherId),
    ),
};

/* ============================================================
 *  AI service
 * ============================================================ */
export const ai = {
  refine: (content: string, instruction: string, model?: string) =>
    call<AIRefineResult>("ai_refine_content", req({ content, instruction, model }), () =>
      stub.aiRefine(content, instruction, model),
    ),
  summary: (content: string, model?: string) =>
    call<{ summary: string }>("ai_generate_summary", req({ content, model }), () =>
      stub.aiSummary(content, model),
    ),
  suggestTags: (content: string, model?: string) =>
    call<{ tags: string[] }>("ai_suggest_tags", req({ content, model }), () =>
      stub.aiSuggestTags(content, model),
    ),
  suggestLinks: (content: string, existingNotes: string[], model?: string) =>
    call<{ suggestions: AISuggestedLink[] }>(
      "ai_suggest_links",
      req({ content, existingNotes, model }),
      () => stub.aiSuggestLinks(content, existingNotes, model),
    ),
  qa: (question: string, workspaceId: string, model?: string) =>
    call<{ answer: string; sources: string[] }>(
      "ai_knowledge_qa",
      req({ question, workspaceId, model }),
      () => stub.aiKnowledgeQA(question, workspaceId, model),
    ),
  listModels: (type: "local" | "cloud") =>
    call<ModelInfo[]>("list_ai_models", req({ type }), () => stub.listAIModels(type)),
  configureModel: (provider: string, apiKey?: string, endpoint?: string) =>
    call<void>("configure_ai_model", req({ provider, apiKey, endpoint }), () =>
      stub.configureAIModel(provider, apiKey, endpoint),
    ),
};

/* ============================================================
 *  Vault file watcher (Tauri native notify)
 * ============================================================ */
export const vaultWatch = {
  start: (rootPath: string) =>
    call<string>("vault_start_watch", { rootPath }, () => stub.vaultStartWatch(rootPath)),
  stop: () => call<void>("vault_stop_watch", {}, () => stub.vaultStopWatch()),
};

/* ============================================================
 *  System / config
 * ============================================================ */
export const system = {
  getAppConfig: async (): Promise<AppConfig> => {
    const raw = await call<AppConfigBackend>("get_app_config", {}, () => stub.getAppConfig());
    return {
      theme: raw.theme as ThemeMode,
      fontSizeUI: raw.font_size,
      fontSizeEditor: raw.font_size,
      fontFamilyEditor: "SF Mono, Fira Code, monospace",
      defaultModelProvider: "ollama",
      recentWorkspaces: [],
    };
  },
  updateAppConfig: (config: Partial<AppConfig>) =>
    call<void>(
      "update_app_config",
      req({
        theme: config.theme,
        fontSize: config.fontSizeEditor,
      }),
      () => stub.updateAppConfig(config),
    ),
  getTheme: async (): Promise<{ theme: ThemeMode }> => {
    const raw = await call<{ theme: string }>("get_theme", {}, () => stub.getTheme());
    return { theme: raw.theme as ThemeMode };
  },
  setTheme: (theme: ThemeMode) => call<void>("set_theme", req({ theme }), () => stub.setTheme(theme)),
};
