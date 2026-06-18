// =====================================================================
//  Shared types — mirror the architecture document (DOI-11).
//  Names and shapes match the Tauri command signatures exactly so the
//  backend can drop in implementations without frontend rewrites.
// =====================================================================

/* ---------- Workspace ---------- */

export interface WorkspaceConfig {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

/** Backend-aligned shape: Rust WorkspaceConfig (snake_case) */
export interface WorkspaceBackendConfig {
  name: string;
  path: string;
  auto_index: boolean;
  exclude_patterns: string[];
}

/** Backend-aligned shape: Rust CreateWorkspaceResponse */
export interface CreateWorkspaceResult {
  id: string;
  path: string;
}

/** Backend-aligned shape: Rust OpenWorkspaceResponse */
export interface OpenWorkspaceResult {
  id: string;
  config: WorkspaceBackendConfig;
}

/** Merged workspace view used by the frontend after create/open */
export interface WorkspaceView {
  id: string;
  name: string;
  path: string;
  autoIndex: boolean;
  excludePatterns: string[];
  createdAt?: string;
  updatedAt?: string;
}

/* ---------- File system ---------- */

export interface FileEntry {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
  modified?: string;
  language?: string;
  children?: FileEntry[];
}

/** Backend-aligned shape: Rust FileEntry (snake_case) */
export interface FileBackendEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string;
}

export interface FileInfo {
  size: number;
  modified: string;
  language: string;
  isDir: boolean;
}

/* ---------- Scratch (unsaved drafts) ---------- */

export interface ScratchBufferPayload {
  scratchId: string;
  displayName: string;
  language: string;
  content: string;
}

/** Layer A cache for workspace files (autosave before manual save to disk). */
export interface WorkspaceDraftPayload {
  vaultPath: string;
  content: string;
  language: string;
  /** Disk mtime when draft was saved (for O(1) change detection). */
  diskMtime?: string;
  /** Disk size when draft was saved (for O(1) change detection). */
  diskSize?: number;
}

export interface ScratchSessionTab {
  tabId: string;
  scratchId: string;
  displayName: string;
  language: string;
  paneId: string;
  previewMode?: string;
}

export interface ScratchSessionPayload {
  panes: string[];
  activePaneId: string;
  activeTabIdByPane: Record<string, string | undefined>;
  tabs: ScratchSessionTab[];
}

export interface ScratchRestoreResponse {
  session: ScratchSessionPayload | null;
  buffers: ScratchBufferPayload[];
}

/* ---------- Editor ---------- */

export interface LanguageDetection {
  language: string;
  confidence: number;
}

export type SupportedLanguage =
  | "markdown"
  | "json"
  | "yaml"
  | "typescript"
  | "javascript"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "cpp"
  | "html"
  | "css"
  | "shell"
  | "sql"
  | "xml"
  | "toml"
  | "plaintext";

/* ---------- Knowledge engine ---------- */

export interface SearchResult {
  filePath: string;
  title: string;
  snippet: string;
  score: number;
  tags?: string[];
}

/** Backend-aligned shape: Rust SearchResult (snake_case) */
export interface SearchBackendResult {
  file_path: string;
  title: string;
  content: string;
  score: number;
}

export interface SemanticResult extends SearchResult {
  similarity: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "note" | "memory" | "concept" | "agent";
  referenceId: string;
  degree?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: "reference" | "embed" | "tag" | "semantic";
  weight?: number;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Backend-aligned shape: Rust GraphNode */
export interface GraphNodeBackend {
  id: string;
  node_type: string;
  reference_id: string;
  properties: Record<string, unknown>;
}

/** Backend-aligned shape: Rust GraphEdge */
export interface GraphEdgeBackend {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  weight: number;
  properties: Record<string, unknown>;
}

/** Backend-aligned shape: Rust KnowledgeGraph */
export interface KnowledgeGraphBackend {
  nodes: GraphNodeBackend[];
  edges: GraphEdgeBackend[];
}

export interface Link {
  source: string;
  target: string;
  context?: string;
  resolved: boolean;
}

export interface Backlink {
  sourceFile: string;
  sourceTitle: string;
  snippet: string;
}

/** Backend-aligned shape: Rust Link */
export interface LinkBackend {
  id: string;
  source_file: string;
  target_file: string;
  link_type: string;
  context: string | null;
}

/** Backend-aligned shape: Rust Backlink */
export interface BacklinkBackend {
  source_file: string;
  context: string | null;
}

export interface TagCount {
  tag: string;
  count: number;
}

/* ---------- Agent memory ---------- */

export type AgentType = "openclaw" | "memgpt" | "custom";
export type MemoryType = "conversation" | "fact" | "procedure" | "context";

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  memoryCount: number;
  lastUpdated?: string;
  color?: string;
}

export interface MemoryEntry {
  id: string;
  agentId: string;
  agentName?: string;
  title?: string;
  content: string;
  type: MemoryType;
  importance?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Backend-aligned shape: Rust MemoryEntry (snake_case) */
export interface MemoryBackendEntry {
  id: string;
  agent_id: string;
  content: string;
  title?: string;
  type: string;
  importance: number;
  last_accessed: string | null;
  access_count: number;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
  tags?: string[];
}

/* ---------- AI service ---------- */

export interface AIRefineResult {
  result: string;
  diff: string;
}

export interface AISuggestedLink {
  filePath: string;
  reason: string;
  confidence: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: "ollama" | "openai" | "anthropic" | "custom";
  endpoint?: string;
  available: boolean;
  latencyMs?: number;
}

/* ---------- App config ---------- */

export type ThemeMode = "light" | "dark" | "system";

export interface AppConfig {
  theme: ThemeMode;
  fontSizeUI: number;
  fontSizeEditor: number;
  fontFamilyEditor: string;
  defaultModelProvider: "ollama" | "openai" | "anthropic";
  lastWorkspaceId?: string;
  recentWorkspaces: string[];
}

/** Backend-aligned shape: Rust GetAppConfigResponse */
export interface AppConfigBackend {
  theme: string;
  auto_save: boolean;
  auto_save_interval: number;
  font_size: number;
  tab_size: number;
  word_wrap: boolean;
  show_line_numbers: boolean;
  minimap: boolean;
  ai_model: string;
  ollama_endpoint: string;
}

/* ---------- Errors ---------- */

export type ErrorCode =
  | "PATH_INVALID"
  | "PATH_NOT_FOUND"
  | "WORKSPACE_EXISTS"
  | "WORKSPACE_NOT_FOUND"
  | "INVALID_WORKSPACE"
  | "FILE_NOT_FOUND"
  | "READ_ERROR"
  | "WRITE_ERROR"
  | "DELETE_ERROR"
  | "CREATE_ERROR"
  | "RENAME_ERROR"
  | "MOVE_ERROR"
  | "PERMISSION_DENIED"
  | "DETECTION_FAILED"
  | "FORMAT_ERROR"
  | "UNSUPPORTED_LANGUAGE"
  | "INDEX_ERROR"
  | "INDEX_NOT_READY"
  | "SEARCH_ERROR"
  | "GRAPH_ERROR"
  | "PARSE_ERROR"
  | "AGENT_NOT_FOUND"
  | "MEMORY_NOT_FOUND"
  | "UPDATE_ERROR"
  | "IMPORT_ERROR"
  | "INVALID_FORMAT"
  | "AI_ERROR"
  | "MODEL_NOT_FOUND"
  | "RAG_ERROR"
  | "CONFIG_ERROR"
  | "ENCRYPT_ERROR"
  | "DECRYPT_ERROR"
  | "INVALID_PASSWORD"
  | "KEY_NOT_FOUND"
  | "EMBEDDING_ERROR"
  | "VECTOR_SEARCH_ERROR"
  | "WATCH_ERROR"
  | "MODEL_LIST_ERROR"
  | "UPDATE_CHECK_ERROR"
  | "QUERY_ERROR"
  | "UNKNOWN";

export class IpcError extends Error {
  code: ErrorCode;
  details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "IpcError";
    this.code = code;
    this.details = details;
  }
}
