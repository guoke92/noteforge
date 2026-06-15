# NoteForge 重构方案

> 生成时间：2026-06-03  
> 范围：Tauri 全栈（React 前端 + Rust 后端）  
> 状态：待实施

---

## 一、重构目标

| 目标 | 现状问题 | 成功标准 |
|------|---------|---------|
| **契约一致** | camelCase / snake_case 混用，DTO 形状不一致，缺 command | 前端 stub 与 Rust 后端可互换，零手动 patch |
| **数据流贯通** | 索引只写 FTS，`notes`/向量/图谱/标签各为空 | 索引一次，搜索/标签/时间线/语义/图谱均可查 |
| **架构收敛** | `main.rs` / `lib.rs` 双轨，command 膨胀 | 单一 crate 入口 + service 层编排 |
| **AI 可交付** | QA 无检索，sources 恒空 | RAG 有 sources，可追踪引用 |
| **文档可信** | jieba/性能/安全声明超前 | README 与代码一致，或标注 Explicit Limitation |

---

## 二、目标架构

```
Frontend                          Tauri Backend
─────────                         ─────────────
React UI
    │
    ▼
ipc/index.ts ──invoke──► commands/*  (薄层：校验 + State 注入)
    │                         │
ipc/stub.ts                   ▼
(browser)              services/*     (业务编排)
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              repositories  engines    db.rs
                    │         │         │
                    └─────────┴────► SQLite
```

### 2.1 Rust 后端目录（目标）

```
src-tauri/src/
├── lib.rs                 # 唯一入口：run() + 模块导出
├── main.rs                # 仅 noteforge_lib::run()
├── error.rs
├── db.rs                  # Database + 连接/迁移
├── config.rs
├── models/                # 共享 DTO（前后端契约源）
│   ├── workspace.rs
│   ├── knowledge.rs
│   ├── memory.rs
│   ├── ai.rs
│   └── common.rs          # rename_all = "camelCase"
├── repositories/          # 纯 SQL，无业务编排
│   ├── workspace_repo.rs
│   ├── note_repo.rs
│   ├── tag_repo.rs
│   ├── link_repo.rs
│   ├── graph_repo.rs
│   ├── memory_repo.rs
│   └── embedding_repo.rs
├── engines/               # 领域能力（可单测）
│   ├── knowledge.rs       # FTS
│   ├── vector.rs
│   ├── ai.rs
│   ├── encryption.rs
│   └── watcher.rs
├── services/              # 业务编排（核心）
│   ├── workspace_service.rs
│   ├── index_pipeline.rs  # ★ 索引总线
│   ├── search_service.rs
│   ├── memory_service.rs
│   ├── graph_service.rs
│   └── ai_service.rs      # RAG 编排
└── commands/              # 薄层：参数校验 + 调 service
    ├── mod.rs
    └── ...
```

**分层原则**

- `commands`：只做鉴权/参数校验/State 注入，≤ 30 行
- `services`：跨表事务、编排、业务规则
- `repositories`：SQL CRUD，禁止循环 SQL（N+1 在此优化）
- `engines`：可替换实现（FTS、向量、Ollama）

### 2.2 前端目录（微调）

```
src/
├── ipc/
│   ├── index.ts           # 仅 invoke，不做字段转换
│   ├── stub.ts
│   └── contracts.ts       # ★ 从 Rust 生成的类型或手写对齐表
├── types.ts               # 逐步收敛到 contracts.ts
```

**关键决策**：Rust `models/*` 为 **契约 Single Source of Truth**，前端 TypeScript 手写对齐（短期）或 `ts-rs` / `typeshare` 生成（中期）。

---

## 三、IPC 契约统一方案（P0）

### 3.1 命名规范

Rust 所有对外 DTO 统一：

```rust
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFulltextRequest {
    pub workspace_id: String,
    pub query: String,
    pub limit: Option<usize>,
}
```

Tauri command 签名推荐继续 **单 Request struct** 风格，加 `rename_all` 即可。

### 3.2 契约对照表（必须补齐/修正）

| Command | 前端现状 | 后端目标 | 动作 |
|---------|---------|---------|------|
| `create_workspace` | 期望 `WorkspaceConfig` | 返回 `{ id, name, path, config }` | 统一为 `WorkspaceOpenResult` |
| `open_workspace` | 期望 `WorkspaceConfig` | 返回 `{ id, config }` | 前端改为 `{ id, ...config }` 或后端 flatten |
| `list_workspaces` | 已调用 | **缺失** | 新增 command + repo |
| `list_agents` | 已调用 | **缺失** | 新增，从 `memories.agent_id` DISTINCT |
| `create_memory` | 传 `title, tags` | 只收 `metadata` | 扩展 Request 或 metadata 规范化 |
| `search_fulltext` 等 | camelCase | snake_case | 全部加 `rename_all` |
| `read_file` | `{ path }` | `path: String` | 保持，已是扁平 |

### 3.3 响应 DTO 规范

定义 **Envelope 最小集**，避免每个 command 各搞一套：

```typescript
type WorkspaceView = {
  id: string;
  name: string;
  path: string;
  autoIndex: boolean;
  excludePatterns: string[];
};

type Paginated<T> = { items: T[]; total: number };
type IndexResult = { indexed: number; errors: string[] };
```

Rust 侧同名结构体 + `rename_all = "camelCase"`。

### 3.4 Contract Test（必做）

新增 `src-tauri/tests/ipc_contract_tests.rs`：

1. 用 serde_json 构造 **与前端 ipc/index.ts 完全一致** 的 JSON
2. 反序列化为 Rust Request struct → 断言成功
3. 序列化 Response → 断言字段名为 camelCase
4. CI 跑 `cargo test ipc_contract`

可选：脚本扫描 `ipc/index.ts` 的 command 名，与 `main.rs` invoke_handler 列表 diff。

---

## 四、IndexPipeline 设计（P0 核心）

### 4.1 职责

一次文件索引，原子更新所有衍生数据。

```rust
pub struct IndexPipeline<'a> {
    note_repo: NoteRepo<'a>,
    knowledge: KnowledgeEngine<'a>,
    vector: VectorEngine<'a>,
    tag_repo: TagRepo<'a>,
    link_repo: LinkRepo<'a>,
    graph: GraphService<'a>,
}

pub struct IndexDocumentInput {
    pub workspace_id: String,
    pub file_path: String,      // 规范化绝对路径
    pub title: String,
    pub content: String,
    pub language: Option<String>,
}

pub struct IndexDocumentResult {
    pub note_id: String,
    pub tags: Vec<String>,
    pub links: usize,
    pub embedding: bool,
}
```

### 4.2 单文档流程

```
IndexDocument(input):
  1. note_repo.upsert(workspace_id, file_path, title, content, language)
     → note_id
  2. knowledge.index(note_id 或 file_path, title, content)   // FTS
  3. vector.store(note_id, "note", content)                   // embedding
  4. tags = extract_tags(content)
     → tag_repo.sync_note_tags(note_id, tags)
  5. links = extract_links(content, file_path)
     → link_repo.replace_for_source(workspace_id, file_path, links)
     → graph.sync_links(workspace_id, links)
  6. return IndexDocumentResult
```

### 4.3 批量索引 `index_knowledge_base`

```
IndexWorkspace(workspace_id, root_path):
  files = walk(root_path, exclude_patterns)
  for file in files (batch 50):
    spawn_blocking:
      content = read(file)
      IndexDocument(...)
  return { indexed, errors }
```

**约束**

- 排除 `.git`、`node_modules`（来自 workspace config）
- 大文件（>10MB）跳过或只索引前 N 字符，写 `errors`
- 不在循环里重复 `KnowledgeEngine::new`（复用连接上的 engine）

### 4.4 增量索引（P1）

文件 watcher 触发时：

```
on Modified/Created(path):
  if under workspace.root && not excluded:
    IndexDocument(...)
on Deleted(path):
  note_repo.delete_by_path(workspace_id, path)
  vector.delete(note_id)
  link_repo.delete_by_source(...)
  knowledge.delete(file_path)
```

`monitor_memory_directory` 与 workspace watcher **共用** `watcher.rs`，挂到 Tauri State。

### 4.5 Schema 修正

**问题**：`links` FK 指向 `notes(file_path)`，workspace 间会冲突。

**方案**（推荐）：

```sql
-- links 表改为
CREATE TABLE links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_file TEXT NOT NULL,
  target_file TEXT NOT NULL,
  link_type TEXT CHECK(link_type IN ('reference', 'embed', 'custom')) DEFAULT 'reference',
  context TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_id, source_file, target_file, link_type)
);
-- 去掉对 notes(file_path) 的 FK，改为 workspace_id + source_file 逻辑关联
```

`notes` 表保持 `(workspace_id, file_path)` 唯一索引：

```sql
CREATE UNIQUE INDEX idx_notes_ws_path ON notes(workspace_id, file_path);
```

新增 migration 版本表 `schema_migrations`。

---

## 五、SearchService 统一检索（P0）

```rust
pub struct SearchService;

impl SearchService {
    pub fn fulltext(&self, ws_id, query, limit) -> Vec<SearchHit>;
    pub fn semantic(&self, ws_id, query, limit) -> Vec<SemanticHit>;
    pub fn hybrid(&self, ws_id, query, limit) -> Vec<SearchHit>; // P2
}
```

**fulltext**

- SQL: FTS JOIN notes ON file_path WHERE notes.workspace_id = ?
- 中文：查询侧集成 jieba-rs（见第六节）

**semantic**

- `vector.search_similar(query, "note", limit)`
- JOIN notes 补全 title/content，不再返回空 title

**get_tags / filter_by_tags / get_timeline**

- 全部经 `note_repo`，依赖 IndexPipeline 灌数据后自然可用

---

## 六、中文分词策略（文档对齐）

二选一，不要文档/code 分裂：

### 方案 A（推荐，MVP+）

- **索引**：FTS5 `unicode61`（保持）
- **查询**：`jieba-rs` 对 query 分词，空格连接后 `MATCH`
- Cargo 加 `jieba-rs`，封装 `engines/tokenizer.rs`

```rust
pub fn prepare_fts_query(raw: &str) -> String {
    jieba.cut(raw, CutMode::Search)
        .join(" ")
        .escape_fts_special_chars()
}
```

### 方案 B（后续）

- 自定义 FTS5 tokenizer 或外置 Tantivy
- 工作量大，不放在第一阶段

更新 README / TECHNICAL_VERIFICATION：**删掉未实现的 jieba 示例，或标注 Phase 2**。

---

## 七、AI / RAG 重构（P1）

### 7.1 AiService 拆分

```
engines/ai/ollama_client.rs    // HTTP 薄客户端
services/ai_service.rs         // 业务 prompt + RAG
```

### 7.2 knowledge_qa 流程

```
AiService::knowledge_qa(workspace_id, question, model):
  1. hits = search_service.hybrid(workspace_id, question, top_k=5)
  2. if hits.is_empty() → 返回明确提示，sources=[]
  3. context = format_chunks(hits)
  4. prompt = RAG_TEMPLATE(context, question)
  5. answer = ollama.generate(model, prompt)
  6. sources = hits.map(|h| h.file_path)
  7. ai_log_repo.insert(...)
```

### 7.3 其他 AI 命令

- `suggest_links`：JSON 解析失败时返回 `AiError`，不要 `unwrap_or_default()` 静默吞掉
- 每次调用写 `ai_logs` 表（已有 schema，未使用）
- `AiService` 实例：Tauri State 单例 + 共享 `reqwest::Client`

### 7.4 模型配置

`configure_ai_model` 应 **持久化** 到 `app_config`，而不是只 ping endpoint。

---

## 八、并发与 DB 访问（P1）

### 8.1 短期（改动小）

```rust
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn with_conn<F, T>(&self, f: F) -> Result<T, NoteforgeError>
    where F: FnOnce(&Connection) -> Result<T, NoteforgeError>
    {
        let conn = self.conn.lock()
            .map_err(|_| NoteforgeError::Internal("db lock poisoned".into()))?;
        f(&conn)
    }
}
```

- 禁止直接 `lock().unwrap()`
- 索引/embedding 用 `tauri::async_runtime::spawn_blocking`

### 8.2 中期（数据量上来后）

- `r2d2` 连接池（SQLite WAL 模式）
- 或 `sqlx` + 单写多读

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
```

---

## 九、安全与加密修复（P1）

| 项 | 修复 |
|----|------|
| API Key 路径 | `{app_data_dir}/secrets/{service}.key`，禁止 CWD |
| 备份 | 引入 `zip` crate，真正打包再 AES-GCM |
| 文件 API | `read_file`/`write_file` 可选：校验路径在已打开 workspace 根下 |
| 密码 | PBKDF2 100k 可保留；记录 KDF 参数在文件头便于升级 |

---

## 十、lib.rs / main.rs 收敛（P0，工作量小）

**目标 `main.rs`：**

```rust
fn main() {
    noteforge_lib::run();
}
```

**目标 `lib.rs`：**

```rust
pub fn run() {
    tracing_subscriber::fmt::init();
    tauri::Builder::default()
        .setup(setup)
        .invoke_handler(generate_handler![...])
        .run(generate_context!())
        .expect("...");
}
```

所有 `mod` 只在 `lib.rs` 声明一次；测试 `use noteforge_lib::...`。

---

## 十一、前端配合改动

### 11.1 IPC 层

- `ipc/index.ts`：参数名已与 camelCase 一致，**后端改完即可**
- 修正返回值消费：
  - `openWorkspace` → 适配 `WorkspaceView`
  - `createWorkspace` → 同上
- 删除或实现 `list_workspaces` / `list_agents` 的后端对应

### 11.2 Stub 对齐

- stub 返回结构与真实 backend **完全一致**（同一 `contracts.ts` 类型）
- stub 不再「比 backend 多字段」

### 11.3 打开 workspace 后

```typescript
await workspace.open(path);
await knowledge.indexWorkspace(workspace.id, workspace.path);
```

在 `workspace.ts` `openWorkspace` 成功后触发索引（若 `autoIndex`）。

---

## 十二、测试策略

| 层级 | 内容 |
|------|------|
| Unit | `extract_tags/links`、FTS query 构建、cosine、encryption roundtrip |
| Integration | IndexPipeline 端到端：临时目录 → index → fulltext/semantic/tags/graph |
| Contract | 每个 command 的 JSON 样本 serde 往返 |
| E2E（可选） | Tauri WebDriver 或前端 vitest + mock invoke |

**覆盖率优先级**：IndexPipeline > IPC contract > RAG > 其余。

---

## 十三、分阶段实施计划

### Phase 0 — 基线（1-2 天）

- [ ] 建立 `models/` + 全局 `rename_all = "camelCase"`
- [ ] `lib.rs` / `main.rs` 收敛
- [ ] IPC contract test 骨架 + command 清单 diff
- [ ] `schema_migrations` v1

### Phase 1 — 契约与缺失 API（3-4 天）

- [ ] 修复全部 Request/Response DTO
- [ ] 实现 `list_workspaces`、`list_agents`
- [ ] 前端 `workspace.ts` / `types.ts` 对齐
- [ ] stub 与 backend 同形

**验收**：Tauri 真环境能 bootstrap 打开 workspace，memory CRUD 正常。

### Phase 2 — IndexPipeline（5-7 天）

- [ ] `repositories/*` 从 command 中抽出
- [ ] 实现 `IndexPipeline` + 改造 `index_knowledge_base`
- [ ] `links` schema 迁移 + workspace 隔离
- [ ] `search_fulltext` / `semantic_search` 走 `SearchService`
- [ ] open workspace 后 auto index

**验收**：索引 10 个 md 后，fulltext、tags、timeline、semantic 均有数据。

### Phase 3 — 增量与 AI（4-5 天）

- [ ] watcher 接入 + `monitor_memory_directory` 实装
- [ ] RAG QA + ai_logs
- [ ] jieba-rs 查询分词
- [ ] API Key / backup 路径修复

**验收**：改文件后 2s 内索引更新；QA 返回非空 sources。

### Phase 4 — 性能与 polish（按需）

- [ ] 向量检索分页 / top-k 优化
- [ ] batch SQL（tag/delete）
- [ ] WAL + spawn_blocking 全面铺开
- [ ] 更新 README，TECHNICAL_VERIFICATION 改为「As-Built」

---

## 十四、风险与取舍

| 决策 | 建议 | 原因 |
|------|------|------|
| 是否引入 sqlx | Phase 4 再考虑 | 当前 rusqlite 够用，迁移成本高 |
| 是否 monorepo 拆前后端 | 否 | Tauri 单体更匹配产品形态 |
| 向量方案 | 先 JSON+内存，>5000 doc 再 sqlite-vec | README 已说明降级，先打通流程 |
| workspace 路径校验 | 建议做 | 本地 app 也有 symlink 风险 |
| ts-rs 自动生成类型 | Phase 1 后可加 | 避免双端手写漂移 |

---

## 十五、建议的 PR 拆分（便于 review）

1. `refactor: consolidate lib entrypoint`
2. `feat: unify IPC DTOs with camelCase + contract tests`
3. `feat: add list_workspaces and list_agents`
4. `refactor: extract repositories from commands`
5. `feat: implement IndexPipeline for knowledge indexing`
6. `feat: SearchService with workspace scoping`
7. `feat: wire file watcher for incremental index`
8. `feat: RAG-based knowledge QA`
9. `fix: secure api key storage and backup zip`
10. `docs: align README with as-built architecture`

---

## 十六、总结

这次重构的 **主线只有一条**：以 `IndexPipeline` 为中心，把「文件 → notes/FTS/向量/标签/链接/图谱」串成单一事务链路；以 `models + contract test` 为约束，把前后端从「能跑 stub」变成「能跑真后端」。

Phase 0 + Phase 1 应优先做——否则后续索引、搜索、AI 都是空中楼阁。Phase 2 是产品可用性的分水岭。

---

## 附录 A：已知问题清单（重构前基线）

### 组织结构

- 仓库名 `noteforge` 与全栈内容不符
- `lib.rs` 与 `main.rs` 双轨模块树
- `watcher.rs` 未接入，`monitor_memory_directory` 为 TODO stub

### IPC 契约

- 前端 camelCase vs 后端 snake_case，无 `rename_all`
- 缺失 `list_workspaces`、`list_agents`
- `open_workspace` / `create_workspace` 响应形状与前端不一致
- `create_memory` 前端传 `title/tags`，后端未接收

### 数据管道

- `index_knowledge_base` 只写 FTS，不写 `notes`/向量/图谱/链接
- `search_fulltext` 忽略 `workspace_id`
- `semantic_search` 索引时未生成 embedding
- `get_tags` / `filter_by_tags` / `get_timeline` 依赖空的 `notes` 表

### AI

- `knowledge_qa` 无 RAG，`sources` 恒空
- `suggest_links` JSON 解析失败静默返回空
- `ai_logs` 表未使用

### 安全

- API Key 存于进程 CWD
- 备份非真正 zip

### 文档

- README/TECHNICAL_VERIFICATION 声称 jieba-rs 集成，代码中不存在
