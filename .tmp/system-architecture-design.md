# NoteForge 系统架构设计文档

> **Phase 2b: 系统架构设计 - NoteForge 重构架构**
> 生成时间：2026-06-03
> 作者：系统架构师
> 约束：不编写业务逻辑代码，不修改需求，不对 UI 设计进行评判

---

## 一、整体架构图（C4 Level 2 — Container）

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NoteForge Desktop App                          │
│                     (Tauri v2 — Single Binary)                       │
├─────────────────────────────────┬───────────────────────────────────┤
│                                 │                                   │
│        React Frontend           │         Rust Backend              │
│    ┌───────────────────┐        │    ┌─────────────────────────┐    │
│    │   src/ipc/        │        │    │   src-tauri/src/        │    │
│    │  index.ts         │◄──IPC──│───►│   commands/             │    │
│    │  stub.ts          │  invoke│    │   services/             │    │
│    │  contracts.ts     │        │    │   repositories/         │    │
│    ├───────────────────┤        │    │   engines/              │    │
│    │   src/types.ts    │        │    │   models/               │    │
│    │   (→ contracts)   │        │    │   db.rs                 │    │
│    ├───────────────────┤        │    │   error.rs              │    │
│    │   src/store/      │        │    └──────────┬──────────────┘    │
│    │   src/features/   │        │               │                   │
│    │   src/components/ │        │    ┌──────────▼──────────────┐    │
│    └───────────────────┘        │    │       SQLite DB          │    │
│                                 │    │   (WAL mode, single conn │    │
│                                 │    │    + Mutex guard)        │    │
│                                 │    └─────────────────────────┘    │
├─────────────────────────────────┴───────────────────────────────────┤
│                     External Services (Optional)                     │
│            Ollama (local LLM)  ·  OpenAI / Anthropic (cloud)        │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.1 分层说明

| 层 | 职责 | 约束 |
|----|------|------|
| **commands/** | 参数校验 + State 注入，Tauri command 入口 | ≤ 30 行，无业务逻辑 |
| **services/** | 跨表事务、业务编排、流程控制 | 单一职责，不含 SQL |
| **repositories/** | 纯 SQL CRUD，N+1 优化 | 无循环调用，无业务判断 |
| **engines/** | 可替换领域能力（FTS、向量、Ollama） | 接口稳定，可独立单测 |
| **models/** | 前后端契约 DTO（Single Source of Truth） | `rename_all = "camelCase"` |
| **db.rs** | 连接管理 + Schema 迁移 | Mutex<Connection>，禁止裸 lock().unwrap() |
| **error.rs** | 统一错误枚举 + 序列化 | 前端 IpcError 一一映射 |

### 1.2 模块依赖关系

```
commands ──► services ──► repositories ──► db (SQLite)
    │            │              │
    │            │              └──► engines (FTS, Vector)
    │            │
    │            └──► engines (AiService, VectorEngine)
    │
    └──► models (DTO)

services ──► models (DTO)
repositories ──► models (DTO)
engines ──► (无内部依赖，仅 rusqlite/reqwest)
```

**依赖方向**：上层依赖下层，禁止反向依赖。engines 与 repositories 同级，互不依赖。

---

## 二、技术栈清单

| 类别 | 选择 | 版本 | 选型理由 |
|------|------|------|---------|
| **桌面框架** | Tauri | v2 | 轻量（~10MB 包体）、Rust 安全、原生 IPC |
| **前端框架** | React | 18.x | 生态成熟，与 Vite 配合好 |
| **前端构建** | Vite | 5.x | 开发速度快，HMR 即时 |
| **UI 样式** | Tailwind CSS | 3.x | 原子化 CSS，快速迭代 |
| **Rust runtime** | Tokio | 1.x (full) | Tauri 2 默认异步运行时 |
| **数据库** | SQLite (rusqlite) | 0.31 | 嵌入式、零运维、WAL 模式高并发读 |
| **FTS** | FTS5 (内置) | — | SQLite 原生全文索引，unicode61 tokenizer |
| **向量嵌入** | fastembed | 4.x | 纯 Rust、离线推理、AllMiniLML6V2 |
| **LLM 客户端** | reqwest | 0.12 | HTTP 客户端，调 Ollama/OpenAI API |
| **加密** | aes-gcm + ring | 0.10 / 0.17 | AES-256-GCM 加密 + PBKDF2 密钥派生 |
| **文件监控** | notify | 6.x | 跨平台文件系统事件 |
| **序列化** | serde + serde_json | 1.x | Rust 序列化事实标准 |
| **日志** | tracing + tracing-subscriber | 0.1 / 0.3 | 结构化日志，比 log 更强 |
| **错误处理** | thiserror | 1.x | 派生宏自定义 Error |
| **UUID** | uuid | 1.x (v4) | 主键生成 |
| **时间** | chrono | 0.4 | 时间处理 + serde 支持 |
| **正则** | regex | 1.x | 标签/链接提取 |
| **中文分词** | jieba-rs | — | Phase 1 后集成，查询侧分词 |

---

## 三、IPC API 端点列表

> 所有 DTO 统一 `#[serde(rename_all = "camelCase")]`，前后端字段名完全一致。

### 3.1 Workspace

#### `create_workspace`
```
Request:  { name: string, path: string }
Response: { id: string, name: string, path: string, autoIndex: boolean, excludePatterns: string[] }
```

#### `open_workspace`
```
Request:  { path: string }
Response: { id: string, name: string, path: string, autoIndex: boolean, excludePatterns: string[] }
```

#### `list_workspaces`  *(新增)*
```
Request:  {}
Response: WorkspaceView[]
```

#### `get_workspace_config`
```
Request:  { id: string }
Response: WorkspaceView
```

#### `update_workspace_config`
```
Request:  { id: string, config: Partial<WorkspaceView> }
Response: void
```

### 3.2 File System

#### `read_file`
```
Request:  { path: string }
Response: { content: string, language: string }
```

#### `write_file`
```
Request:  { path: string, content: string }
Response: void
```

#### `list_directory`
```
Request:  { path: string }
Response: FileEntry[]
```

#### `create_file`
```
Request:  { path: string, content?: string }
Response: void
```

#### `delete_file`
```
Request:  { path: string }
Response: void
```

#### `rename_file`
```
Request:  { oldPath: string, newPath: string }
Response: void
```

#### `move_file`
```
Request:  { source: string, destination: string }
Response: void
```

#### `get_file_info`
```
Request:  { path: string }
Response: { size: number, modified: string, language: string }
```

### 3.3 Editor

#### `detect_language`
```
Request:  { content: string, filename?: string }
Response: { language: string, confidence: number }
```

#### `format_code`
```
Request:  { content: string, language: string }
Response: { formatted: string }
```

### 3.4 Knowledge Engine

#### `index_knowledge_base`
```
Request:  { workspaceId: string, path: string }
Response: { indexed: number, errors: string[] }
```

#### `search_fulltext`
```
Request:  { workspaceId: string, query: string, limit?: number }
Response: SearchResult[]
```
SearchResult: `{ filePath: string, title: string, snippet: string, score: number, tags?: string[] }`

#### `semantic_search`
```
Request:  { workspaceId: string, query: string, limit?: number }
Response: SemanticResult[]
```
SemanticResult: `{ filePath: string, title: string, snippet: string, score: number, similarity: number }`

#### `get_knowledge_graph`
```
Request:  { workspaceId: string }
Response: { nodes: GraphNode[], edges: GraphEdge[] }
```
GraphNode: `{ id: string, label: string, type: "note"|"memory"|"concept"|"agent", referenceId: string, degree?: number }`
GraphEdge: `{ id: string, source: string, target: string, type: "reference"|"embed"|"tag"|"semantic", weight?: number }`

#### `extract_links`
```
Request:  { content: string, filePath: string }
Response: Link[]
```
Link: `{ source: string, target: string, context?: string, resolved: boolean }`

#### `extract_tags`
```
Request:  { content: string }
Response: string[]
```

#### `get_backlinks`
```
Request:  { filePath: string }
Response: Backlink[]
```
Backlink: `{ sourceFile: string, sourceTitle: string, snippet: string }`

#### `get_tags`
```
Request:  { workspaceId: string }
Response: TagCount[]
```
TagCount: `{ tag: string, count: number }`

#### `filter_by_tags`
```
Request:  { workspaceId: string, tags: string[] }
Response: FileEntry[]
```

### 3.5 Agent Memory

#### `list_agents`  *(新增)*
```
Request:  {}
Response: Agent[]
```
Agent: `{ id: string, name: string, type: "openclaw"|"memgpt"|"custom", memoryCount: number, lastUpdated?: string, color?: string }`

#### `list_agent_memories`
```
Request:  { agentId?: string, type?: "conversation"|"fact"|"procedure"|"context" }
Response: MemoryEntry[]
```

#### `get_memory_timeline`
```
Request:  { agentId?: string, startDate?: string, endDate?: string }
Response: MemoryEntry[]
```

#### `create_memory`
```
Request:  { agentId: string, content: string, type: MemoryType, title?: string, tags?: string[] }
Response: { id: string }
```

#### `update_memory`
```
Request:  { memoryId: string, content: string, metadata?: Record<string, unknown> }
Response: void
```

#### `delete_memory`
```
Request:  { memoryId: string }
Response: void
```

#### `batch_tag_memories`
```
Request:  { memoryIds: string[], tags: string[] }
Response: void
```

#### `batch_delete_memories`
```
Request:  { memoryIds: string[] }
Response: void
```

#### `import_agent_memories`
```
Request:  { agentId: string, format: string, data: string }
Response: { imported: number, errors: string[] }
```

#### `monitor_memory_directory`
```
Request:  { agentId: string, path: string }
Response: { watcherId: string }
```

### 3.6 AI Service

#### `ai_refine_content`
```
Request:  { content: string, instruction: string, model?: string }
Response: { result: string, diff: string }
```

#### `ai_generate_summary`
```
Request:  { content: string, model?: string }
Response: { summary: string }
```

#### `ai_suggest_tags`
```
Request:  { content: string, model?: string }
Response: { tags: string[] }
```

#### `ai_suggest_links`
```
Request:  { content: string, existingNotes: string[], model?: string }
Response: { suggestions: AISuggestedLink[] }
```
AISuggestedLink: `{ filePath: string, reason: string, confidence: number }`

#### `ai_knowledge_qa`
```
Request:  { question: string, workspaceId: string, model?: string }
Response: { answer: string, sources: string[] }
```

#### `list_ai_models`
```
Request:  { type: "local"|"cloud" }
Response: ModelInfo[]
```
ModelInfo: `{ id: string, name: string, provider: "ollama"|"openai"|"anthropic"|"custom", endpoint?: string, available: boolean, latencyMs?: number }`

#### `configure_ai_model`
```
Request:  { provider: string, apiKey?: string, endpoint?: string }
Response: void
```

### 3.7 Search & Filter

#### `get_tags`
(同 3.4)

#### `filter_by_tags`
(同 3.4)

#### `get_timeline`
```
Request:  { workspaceId: string, startDate?: string, endDate?: string }
Response: TimelineEntry[]
```
TimelineEntry: `{ id: string, title: string, content: string, createdAt: string, updatedAt: string }`

### 3.8 Encryption

#### `encrypt_backup`
```
Request:  { workspacePath: string, password: string, outputPath: string }
Response: { path: string }
```

#### `decrypt_backup`
```
Request:  { backupPath: string, password: string, outputPath: string }
Response: { restored: number }
```

#### `store_api_key`
```
Request:  { service: string, key: string, password: string }
Response: void
```

#### `retrieve_api_key`
```
Request:  { service: string, password: string }
Response: { key: string }
```

### 3.9 System Config

#### `get_app_config`
```
Request:  {}
Response: AppConfig
```
AppConfig: `{ theme: ThemeMode, fontSizeUI: number, fontSizeEditor: number, fontFamilyEditor: string, defaultModelProvider: "ollama"|"openai"|"anthropic", lastWorkspaceId?: string, recentWorkspaces: string[] }`

#### `update_app_config`
```
Request:  { config: Partial<AppConfig> }
Response: void
```

#### `get_theme`
```
Request:  {}
Response: { theme: ThemeMode }
```

#### `set_theme`
```
Request:  { theme: ThemeMode }
Response: void
```

---

## 四、数据库核心表结构

### 4.1 ER 简图

```
workspaces ──1:N──► notes ──M:N──► tags
     │                  │              ▲
     │                  │              │
     │                  └── note_tags ─┘
     │
     ├──1:N──► memories ──M:N──► memory_tags
     │
     ├──1:N──► file_watchers
     │
     ├──1:N──► search_history
     │
     └──1:N──► ai_logs

links (workspace 隔离，无 FK → notes)
graph_nodes ──1:N──► graph_edges
document_embeddings (向量存储)
schema_migrations (版本管理)
app_config (KV 配置)
```

### 4.2 表结构定义

#### `workspaces`
```sql
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    config JSON,                          -- WorkspaceView 的 JSON 序列化
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `notes`
```sql
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    title TEXT,
    content TEXT,
    language TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- 关键：workspace 内 file_path 唯一
CREATE UNIQUE INDEX idx_notes_ws_path ON notes(workspace_id, file_path);
CREATE INDEX idx_notes_workspace ON notes(workspace_id);
```

#### `memories`
```sql
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    workspace_id TEXT,                    -- 关联 workspace（可选）
    content TEXT NOT NULL,
    type TEXT CHECK(type IN ('conversation', 'fact', 'procedure', 'context')) NOT NULL,
    importance REAL DEFAULT 0.5,
    last_accessed TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSON
);

CREATE INDEX idx_memories_agent ON memories(agent_id);
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_importance ON memories(importance DESC);
```

#### `tags` & 关联表
```sql
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE note_tags (
    note_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE memory_tags (
    memory_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (memory_id, tag_id),
    FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

#### `links`（重构后 — workspace 隔离）
```sql
CREATE TABLE links (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,           -- ★ 新增：workspace 隔离
    source_file TEXT NOT NULL,            -- 源文件路径
    target_file TEXT NOT NULL,            -- 目标文件路径
    link_type TEXT CHECK(link_type IN ('reference', 'embed', 'custom')) DEFAULT 'reference',
    context TEXT,                         -- 链接上下文片段
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, source_file, target_file, link_type)  -- 唯一约束
);

CREATE INDEX idx_links_workspace ON links(workspace_id);
CREATE INDEX idx_links_source ON links(workspace_id, source_file);
CREATE INDEX idx_links_target ON links(workspace_id, target_file);
-- 注意：移除对 notes(file_path) 的 FK，改为 workspace_id 逻辑关联
```

**变更说明**：
- 原 schema 中 `links` 通过 FK 引用 `notes(file_path)`，多 workspace 会冲突
- 重构后 `links` 以 `workspace_id` + `source_file` 做逻辑关联，无硬 FK
- 删除链接时通过 `workspace_id + source_file` 定位

#### `graph_nodes` & `graph_edges`
```sql
CREATE TABLE graph_nodes (
    id TEXT PRIMARY KEY,
    node_type TEXT CHECK(node_type IN ('note', 'memory', 'concept', 'agent')) NOT NULL,
    reference_id TEXT NOT NULL,           -- 关联 notes.id / memories.id 等
    workspace_id TEXT,                    -- ★ 新增：workspace 隔离
    properties JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE graph_edges (
    id TEXT PRIMARY KEY,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    properties JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_node_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_graph_edges_source ON graph_edges(source_node_id);
CREATE INDEX idx_graph_edges_target ON graph_edges(target_node_id);
```

#### `document_embeddings`（向量存储）
```sql
CREATE TABLE document_embeddings (
    document_id TEXT PRIMARY KEY,        -- 对应 notes.id
    document_type TEXT NOT NULL,         -- 'note' | 'memory'
    embedding JSON NOT NULL,             -- Vec<f32> 序列化
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `schema_migrations`（版本管理）
```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,         -- 递增版本号
    name TEXT NOT NULL,                  -- 迁移名称
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

初始版本：`v1` — 基线 schema（含 links workspace 修正）。

#### `file_watchers`
```sql
CREATE TABLE file_watchers (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    path TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

#### `search_history`
```sql
CREATE TABLE search_history (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    query TEXT NOT NULL,
    type TEXT CHECK(type IN ('fulltext', 'semantic', 'graph')) NOT NULL,
    result_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

#### `ai_logs`
```sql
CREATE TABLE ai_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    duration_ms INTEGER,
    success BOOLEAN,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

#### `app_config`
```sql
CREATE TABLE app_config (
    key TEXT PRIMARY KEY,
    value JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 FTS5 虚拟表
```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
    content,
    title,
    file_path,
    tokenize='unicode61 remove_diacritics 2'
);
```

---

## 五、IndexPipeline 数据流图

### 5.1 架构定位

```
┌────────────────────────────────────────────────────────────────┐
│                       IndexPipeline                             │
│                                                                │
│   Input: { workspaceId, filePath, title, content, language? }   │
│                                                                │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   │
│   │ note_repo│   │knowledge │   │ vector   │   │ tag_repo │   │
│   │ .upsert()│──►│.index()  │──►│.store()  │──►│.sync()   │   │
│   └──────────┘   └──────────┘   └──────────┘   └──────────┘   │
│        │                                           │           │
│        │         ┌──────────┐   ┌──────────┐      │           │
│        └────────►│link_repo │──►│  graph   │◄─────┘           │
│                  │.replace()│   │.sync()   │                   │
│                  └──────────┘   └──────────┘                   │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 单文档索引流程

```
IndexDocument(IndexDocumentInput):
  │
  ├─ Step 1: note_repo.upsert(workspace_id, file_path, title, content, language)
  │          → returns note_id
  │          → INSERT OR REPLACE INTO notes (id, workspace_id, file_path, title, content, language)
  │          → 确保 (workspace_id, file_path) 唯一
  │
  ├─ Step 2: knowledge_engine.index(note_id, title, content)
  │          → FTS5: DELETE + INSERT INTO notes_fts
  │          → 全文索引即时可查
  │
  ├─ Step 3: vector_engine.store(note_id, "note", content)
  │          → fastembed 生成 embedding
  │          → INSERT INTO document_embeddings (document_id, document_type, embedding)
  │
  ├─ Step 4: extract_tags(content) → tag_repo.sync_note_tags(note_id, tags)
  │          → 解析 #tag 和 YAML frontmatter tags
  │          → DELETE old + INSERT new INTO note_tags
  │          → 自动创建 tags 表中不存在的标签
  │
  ├─ Step 5: extract_links(content, file_path) → link_repo.replace_for_source(workspace_id, file_path, links)
  │          → 解析 [[wiki-links]] 和 [markdown](links)
  │          → DELETE FROM links WHERE workspace_id = ? AND source_file = ?
  │          → INSERT INTO links (workspace_id, source_file, target_file, link_type, context)
  │
  ├─ Step 6: graph_service.sync_links(workspace_id, links)
  │          → 为每个唯一文件创建/更新 graph_nodes
  │          → 为每条链接创建 graph_edges
  │          → 更新节点 degree
  │
  └─ return IndexDocumentResult { note_id, tags, links_count, embedding_done }
```

### 5.3 批量索引 `index_knowledge_base`

```
IndexWorkspace(workspace_id, root_path):
  │
  ├─ Step 1: walkdir 遍历 root_path
  │          → 排除 .git, node_modules, 以及 workspace config 中的 exclude_patterns
  │          → 过滤支持的文件扩展名: .md, .txt, .json, .yaml, .yml
  │
  ├─ Step 2: 分批处理（batch_size = 50）
  │          → for each file in batch:
  │              spawn_blocking:
  │                content = fs::read_to_string(file)
  │                title = file_stem
  │                IndexDocument(...)
  │
  ├─ Step 3: 错误收集
  │          → 大文件 (>10MB): 跳过，记录 error
  │          → 读取失败: 记录 error，继续
  │          → 索引失败: 记录 error，继续
  │
  └─ return { indexed: count, errors: Vec<String> }
```

### 5.4 增量索引（FileWatcher 集成）

```
FileWatcher Event → IndexPipeline
  │
  ├─ Created(path):
  │    if under workspace.root && not excluded:
  │      IndexDocument(...)
  │
  ├─ Modified(path):
  │    if under workspace.root && not excluded:
  │      IndexDocument(...)  -- upsert 覆盖
  │
  ├─ Deleted(path):
  │    note_repo.delete_by_path(workspace_id, path)
  │    vector_engine.delete_embedding(note_id)
  │    link_repo.delete_by_source(workspace_id, path)
  │    knowledge_engine.delete(path)
  │    graph_service.remove_node(workspace_id, path)
  │
  └─ Renamed(old_path, new_path):
       → 相当于 delete(old) + index(new)
```

### 5.5 数据写入总览

```
                        IndexPipeline
                             │
    ┌────────────┬───────────┼───────────┬────────────┐
    ▼            ▼           ▼           ▼            ▼
  notes     notes_fts    document_    tags +      links +
  (CRUD)    (FTS5)       embeddings   note_tags   graph_edges
    │            │        (向量)       (标签)      (图谱)
    │            │           │           │            │
    └────┬───────┴───────────┴───────────┴────────────┘
         │
      SQLite (WAL mode)
```

---

## 六、SearchService 检索流程

### 6.1 架构定位

```
┌────────────────────────────────────────────────────────────────┐
│                       SearchService                             │
│                                                                │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐                  │
│   │fulltext()│   │semantic()│   │ hybrid() │ (Phase 2)        │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘                  │
│        │              │              │                         │
│        ▼              ▼              ▼                         │
│   FTS5 MATCH    VectorEngine    Merge +                        │
│   + JOIN notes  .search_similar Rerank                        │
│        │              │              │                         │
│        └──────────────┴──────────────┘                         │
│                       │                                        │
│                  Vec<SearchHit>                                │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Fulltext 检索流程

```
SearchService::fulltext(workspace_id, query, limit):
  │
  ├─ Step 1: jieba 分词（Phase 1+）
  │          → prepare_fts_query(query)
  │          → "人工智能" → "人工智能"（保持原样，unicode61 支持 CJK）
  │          → "机器学习入门" → "机器 学习 入门"（search 模式分词）
  │
  ├─ Step 2: FTS5 查询
  │          SELECT file_path, title, snippet(notes_fts, 0, '<mark>', '</mark>', '...', 32)
  │          FROM notes_fts
  │          WHERE notes_fts MATCH ?
  │          ORDER BY rank
  │          LIMIT ?
  │
  ├─ Step 3: JOIN notes 补全元数据
  │          SELECT n.id, n.workspace_id, n.title, n.file_path, fts.*
  │          FROM notes_fts fts
  │          JOIN notes n ON n.file_path = fts.file_path
  │          WHERE n.workspace_id = ? AND notes_fts MATCH ?
  │          → 确保只返回当前 workspace 的结果
  │
  ├─ Step 4: 附加标签
  │          SELECT t.name FROM tags t
  │          JOIN note_tags nt ON t.id = nt.tag_id
  │          WHERE nt.note_id = ?
  │
  └─ return Vec<SearchHit> { filePath, title, snippet, score, tags }
```

### 6.3 Semantic 检索流程

```
SearchService::semantic(workspace_id, query, limit):
  │
  ├─ Step 1: 生成查询 embedding
  │          vector_engine.search_similar(query, Some("note"), limit * 2)
  │          → fastembed 生成 query embedding
  │          → 遍历 document_embeddings 计算 cosine similarity
  │          → 返回 top N 候选
  │
  ├─ Step 2: 过滤 workspace
  │          SELECT n.id, n.title, n.file_path, n.content
  │          FROM notes n
  │          WHERE n.workspace_id = ? AND n.id IN (?)
  │
  ├─ Step 3: 构造结果
  │          → snippet 从 content 截取前 200 字符
  │          → similarity 保留为 score
  │
  └─ return Vec<SemanticHit> { filePath, title, snippet, score, similarity }
```

### 6.4 Hybrid 检索流程（Phase 2）

```
SearchService::hybrid(workspace_id, query, limit):
  │
  ├─ Step 1: 并行执行 fulltext + semantic
  │          let (ft_results, sem_results) = tokio::join!(
  │              self.fulltext(workspace_id, query, limit),
  │              self.semantic(workspace_id, query, limit),
  │          );
  │
  ├─ Step 2: 融合去重
  │          → 以 filePath 为 key
  │          → fulltext score 归一化到 [0,1]
  │          → semantic similarity 已在 [0,1]
  │          → combined_score = α * ft_score + (1-α) * sem_score
  │          → α 默认 0.6（偏向全文检索）
  │
  ├─ Step 3: Rerank
  │          → 按 combined_score 降序排序
  │          → 取 top limit 条
  │
  └─ return Vec<SearchHit>
```

### 6.5 检索路径对比

| 路径 | 数据源 | 适用场景 | 中文支持 |
|------|--------|---------|---------|
| fulltext | FTS5 索引 | 关键词精确匹配 | unicode61 + jieba |
| semantic | 向量嵌入 | 语义相似性 | 语言无关 |
| hybrid | FTS5 + 向量 | 综合最佳 | 双重支持 |

### 6.6 get_tags / filter_by_tags / get_timeline

```
get_tags(workspace_id):
  SELECT t.name, COUNT(nt.note_id) as count
  FROM tags t
  JOIN note_tags nt ON t.id = nt.tag_id
  JOIN notes n ON nt.note_id = n.id
  WHERE n.workspace_id = ?
  GROUP BY t.id, t.name
  ORDER BY count DESC

filter_by_tags(workspace_id, tags[]):
  SELECT DISTINCT n.file_path, n.title
  FROM notes n
  JOIN note_tags nt ON n.id = nt.note_id
  JOIN tags t ON nt.tag_id = t.id
  WHERE n.workspace_id = ? AND t.name IN (?)

get_timeline(workspace_id, start_date?, end_date?):
  SELECT id, title, content, created_at, updated_at
  FROM notes
  WHERE workspace_id = ?
    AND created_at >= ? (optional)
    AND created_at <= ? (optional)
  ORDER BY created_at DESC
```

---

## 七、Error 映射表

| NoteforgeError | HTTP-style Code | 前端 ErrorCode |
|-------------|----------------|---------------|
| Database(e) | DATABASE_ERROR | QUERY_ERROR |
| Io(e) | IO_ERROR | READ_ERROR / WRITE_ERROR |
| Json(e) | JSON_ERROR | PARSE_ERROR |
| Notify(e) | NOTIFY_ERROR | WATCH_ERROR |
| Reqwest(e) | REQWEST_ERROR | AI_ERROR |
| Encryption(e) | ENCRYPT_ERROR | ENCRYPT_ERROR |
| Ai(e) | AI_ERROR | AI_ERROR |
| NotFound(e) | NOT_FOUND | FILE_NOT_FOUND / WORKSPACE_NOT_FOUND |
| InvalidInput(e) | INVALID_INPUT | PATH_INVALID / INVALID_FORMAT |
| PermissionDenied(e) | PERMISSION_DENIED | PERMISSION_DENIED |
| Internal(e) | INTERNAL_ERROR | UNKNOWN |
| VectorSearch(e) | VECTOR_SEARCH_ERROR | VECTOR_SEARCH_ERROR |

---

## 八、安全设计

| 风险点 | 措施 |
|--------|------|
| API Key 存储 | `{app_data_dir}/secrets/{service}.key`，AES-GCM 加密，禁止 CWD |
| 备份加密 | 真正 zip 打包 + AES-GCM，密码 PBKDF2 100k 迭代 |
| 文件路径校验 | `read_file`/`write_file` 可选校验路径在已打开 workspace 根下 |
| DB 锁 | Mutex<Connection> + with_conn() 辅助方法，禁止裸 lock().unwrap() |
| LLM 调用 | reqwest 超时 30s，重试 2 次，错误不暴露内部 endpoint |

---

## 九、并发模型

```
Tauri Command (async)
    │
    ├─ db.with_conn(|conn| { ... })    -- 同步 DB 操作（Mutex 保护）
    │
    ├─ spawn_blocking(|| {             -- CPU 密集操作
    │      walkdir + fs::read
    │      jieba 分词
    │  })
    │
    └─ ai_service.xxx().await          -- 异步 HTTP 调用
           (reqwest + tokio)
```

**规则**：
- DB 操作用 `with_conn()`，内部 `lock()` 超时返回错误
- 文件 I/O + CPU 密集用 `spawn_blocking`
- HTTP 调用用 `async/await`
- IndexPipeline 批量操作在 `spawn_blocking` 中执行

---

## 十、前端配合要点

### 10.1 IPC 层
- `ipc/index.ts`：参数名已与 camelCase 一致，后端改完即可
- `ipc/stub.ts`：返回结构与真实 backend 完全一致（同一 `contracts.ts` 类型）
- 新增 `src/ipc/contracts.ts`：集中定义所有 IPC DTO 类型

### 10.2 类型收敛
- `src/types.ts` → `src/ipc/contracts.ts` 逐步迁移
- Rust `models/*` 为 Single Source of Truth
- 短期手写对齐，中期 `ts-rs` / `typeshare` 自动生成

### 10.3 打开 workspace 后
```typescript
await workspace.open(path);
// 自动触发索引
await knowledge.indexWorkspace(workspace.id, workspace.path);
```

---

## 附录：重构前后对比

| 维度 | 重构前 | 重构后 |
|------|--------|--------|
| 入口 | main.rs + lib.rs 双轨 | lib.rs 唯一入口 |
| 命名 | snake_case / camelCase 混用 | 全局 camelCase |
| 目录 | commands 膨胀 | commands/services/repositories/engines 四层 |
| 索引 | 只写 FTS | 一次索引 → notes/FTS/向量/标签/链接/图谱 |
| 搜索 | fulltext 忽略 workspace_id | workspace 隔离 + fulltext/semantic/hybrid |
| links | FK → notes(file_path) 多 workspace 冲突 | workspace_id 逻辑隔离 |
| AI/RAG | knowledge_qa 无检索 | RAG 有 sources，可追踪引用 |
| 配置 | AppConfig 不持久化 AI model | 完整持久化 |
| 错误 | NoteforgeError 不序列化 | 统一 JSON 序列化 |
| 迁移 | 无版本管理 | schema_migrations |
