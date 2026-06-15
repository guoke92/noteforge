# NoteForge 重构需求方案说明书

> 版本：v1.0  
> 日期：2026-06-03  
> 作者：需求分析师  
> 状态：Phase 1 — 需求细化

---

## 一、用户角色与核心场景

### 1.1 用户角色

| 角色 | 描述 | 典型操作 |
|------|------|---------|
| **知识工作者** | 主要用户，使用 NoteForge 管理技术文档和知识库 | 创建/打开 workspace，索引文件，全文搜索，标签过滤，查看时间线 |
| **AI 协作者** | 通过 AI 功能增强知识管理的用户 | 使用 AI 精炼内容、生成摘要、推荐标签/链接、知识问答 |
| **多 Agent 用户** | 管理多个 AI Agent 记忆的用户 | 创建/管理 Agent，导入/导出记忆，按类型过滤记忆 |

### 1.2 核心场景

**场景 1：首次使用**
1. 用户启动 NoteForge
2. 创建新的 workspace（指定名称和路径）
3. 打开 workspace，系统自动索引目录下的文件
4. 用户浏览索引结果，确认全文搜索/标签/时间线可用

**场景 2：日常知识管理**
1. 用户打开已有 workspace
2. 编辑 Markdown 文件（前端 Monaco Editor）
3. 系统自动检测文件变更并增量索引
4. 用户通过全文搜索、标签过滤、时间线查找知识
5. 用户使用 AI 功能精炼内容或生成摘要

**场景 3：知识问答（RAG）**
1. 用户打开 workspace，系统完成索引
2. 用户输入问题，系统执行混合检索（全文 + 语义）
3. 系统将检索结果作为上下文发送给 AI 模型
4. 系统返回答案 + 引用来源（sources）

**场景 4：多 Agent 记忆管理**
1. 用户创建或选择 Agent
2. 导入 Agent 记忆（JSON 格式）
3. 按类型（conversation/fact/procedure/context）过滤记忆
4. 批量打标签或删除记忆
5. 查看记忆时间线

**场景 5：知识图谱探索**
1. 用户打开 workspace
2. 查看知识图谱（节点 = 文件/记忆，边 = 引用/标签/语义关联）
3. 点击节点查看反向链接（backlinks）

---

## 二、功能列表

### 2.1 P0 — 核心功能（Phase 0-1，必须实现）

| 编号 | 功能 | 描述 | 当前状态 | 优先级 |
|------|------|------|---------|--------|
| F-001 | Workspace CRUD | 创建/打开/配置/更新 workspace | 部分实现（缺 list_workspaces） | P0 |
| F-002 | IPC 契约统一 | 所有 DTO 统一 camelCase，补齐缺失 command | 未实现（snake_case 混用） | P0 |
| F-003 | lib.rs/main.rs 收敛 | 单一 crate 入口，消除双轨模块树 | 未实现（双轨并存） | P0 |
| F-004 | Contract Test | IPC 契约自动化测试 | 未实现 | P0 |
| F-005 | list_workspaces | 列出所有 workspace | 缺失 | P0 |
| F-006 | list_agents | 列出所有 Agent（从 memories 表 DISTINCT） | 缺失 | P0 |
| F-007 | create_memory 对齐 | 前端传 title/tags，后端需接收 | 不一致 | P0 |

### 2.2 P0 — 核心功能（Phase 2，数据贯通）

| 编号 | 功能 | 描述 | 当前状态 | 优先级 |
|------|------|------|---------|--------|
| F-010 | IndexPipeline | 单文件索引原子更新 notes/FTS/向量/标签/链接/图谱 | 未实现（只写 FTS） | P0 |
| F-011 | SearchService | 统一检索（fulltext/semantic/hybrid） | 部分实现（缺 workspace 过滤） | P0 |
| F-012 | Workspace 隔离 | 搜索/标签/时间线按 workspace_id 过滤 | 未实现 | P0 |
| F-013 | links schema 迁移 | links 表改为 workspace_id + source_file 逻辑关联 | 未实现（FK 指向 notes(file_path)） | P0 |
| F-014 | 自动索引 | 打开 workspace 后自动触发索引 | 未实现 | P0 |

### 2.3 P1 — 重要功能（Phase 3）

| 编号 | 功能 | 描述 | 当前状态 | 优先级 |
|------|------|------|---------|--------|
| F-020 | 增量索引（watcher） | 文件变更后 2s 内自动更新索引 | 未实现（TODO stub） | P1 |
| F-021 | RAG 知识问答 | QA 带 sources，可追踪引用 | 未实现（sources 恒空） | P1 |
| F-022 | jieba-rs 查询分词 | 中文查询分词后 FTS MATCH | 未实现（文档超前） | P1 |
| F-023 | API Key 安全加固 | 密钥存于 app_data_dir/secrets/ | 未实现（存于 CWD） | P1 |
| F-024 | 备份加密 | zip 打包 + AES-GCM 加密 | 未实现（非真正 zip） | P1 |
| F-025 | ai_logs 记录 | 每次 AI 调用写日志 | 未实现（表存在但未使用） | P1 |
| F-026 | suggest_links 错误处理 | JSON 解析失败返回明确错误 | 未实现（静默吞掉） | P1 |

### 2.4 P2 — 增强功能（Phase 4，按需）

| 编号 | 功能 | 描述 | 当前状态 | 优先级 |
|------|------|------|---------|--------|
| F-030 | 混合检索（hybrid） | fulltext + 语义融合排序 | 未实现 | P2 |
| F-031 | WAL 模式 | SQLite WAL + spawn_blocking | 未实现 | P2 |
| F-032 | batch SQL 优化 | 批量 tag/delete 操作 | 未实现 | P2 |
| F-033 | ts-rs 自动生成类型 | 前端 TypeScript 类型从 Rust 自动生成 | 未实现 | P2 |
| F-034 | r2d2 连接池 | 数据库连接池（数据量上来后） | 未实现 | P2 |

---

## 三、功能详细用户故事与验收条件

### F-001: Workspace CRUD

**用户故事：**  
作为知识工作者，我希望能创建和管理多个 workspace，以便将不同项目/主题的知识分开管理。

**验收条件：**

```gherkin
Scenario: 创建 workspace
  Given 用户在 NoteForge 主界面
  When 用户输入 workspace 名称 "my-project" 并选择路径 "/Users/me/docs/my-project"
  Then 系统创建 workspace 记录，返回 { id, name, path, config }
  And workspace 目录被创建（若不存在）
  And 系统拒绝重复创建（同一路径）

Scenario: 打开 workspace
  Given 已存在 workspace "my-project" 路径 "/Users/me/docs/my-project"
  When 用户打开该路径
  Then 系统返回 { id, name, path, autoIndex, excludePatterns }
  And 若 autoIndex 为 true，自动触发索引

Scenario: 获取 workspace 配置
  Given 已打开 workspace
  When 用户查看配置
  Then 返回完整的 WorkspaceConfig（name, path, autoIndex, excludePatterns）

Scenario: 更新 workspace 配置
  Given 已打开 workspace
  When 用户修改 autoIndex 为 false
  Then 配置持久化到数据库
```

---

### F-002: IPC 契约统一

**用户故事：**  
作为开发者，我希望前后端 IPC 通信使用统一的命名规范（camelCase），使得前端无需手动 patch 后端响应。

**验收条件：**

```gherkin
Scenario: DTO 命名规范
  Given 后端所有 Request/Response DTO
  When 序列化为 JSON
  Then 所有字段名均为 camelCase
  And 前端 ipc/index.ts 的参数名与后端一致

Scenario: 缺失 command 补齐
  Given 前端已调用 list_workspaces 和 list_agents
  When 后端实现这两个 command
  Then 返回值结构与前端 TypeScript 类型完全匹配

Scenario: create_memory 对齐
  Given 前端调用 create_memory 传 { agentId, content, type, title, tags }
  When 后端接收
  Then title 和 tags 被正确存储到 metadata 或专用字段
```

---

### F-003: lib.rs/main.rs 收敛

**用户故事：**  
作为开发者，我希望项目只有一个 crate 入口，消除 main.rs 和 lib.rs 双轨模块树，降低维护复杂度。

**验收条件：**

```gherkin
Scenario: 单一入口
  Given 项目结构
  When 查看 main.rs
  Then main.rs 仅调用 noteforge_lib::run()
  And 所有 mod 声明只在 lib.rs 中出现

Scenario: 测试可用
  Given lib.rs 导出 pub mod
  When 运行 cargo test
  Then 测试通过 use noteforge_lib::... 引用模块
```

---

### F-004: Contract Test

**用户故事：**  
作为开发者，我希望有自动化测试验证前后端 IPC 契约一致性，避免手动对齐出错。

**验收条件：**

```gherkin
Scenario: JSON 序列化/反序列化测试
  Given 前端 ipc/index.ts 中的每个 command
  When 用 serde_json 构造与前端完全一致的 JSON
  Then 反序列化为 Rust Request struct 成功
  And 序列化 Response 后字段名均为 camelCase

Scenario: Command 清单 diff
  Given 前端 ipc/index.ts 中的 command 名列表
  When 与 main.rs invoke_handler 列表对比
  Then 无缺失或多余的 command
```

---

### F-005: list_workspaces

**用户故事：**  
作为用户，我希望看到所有已创建的 workspace 列表，以便快速切换。

**验收条件：**

```gherkin
Scenario: 列出 workspace
  Given 数据库中有 3 个 workspace
  When 用户调用 list_workspaces
  Then 返回 WorkspaceConfig[]，包含 id, name, path, config
  And 按 updated_at 降序排列

Scenario: 空列表
  Given 数据库中无 workspace
  When 用户调用 list_workspaces
  Then 返回空数组 []
```

---

### F-006: list_agents

**用户故事：**  
作为多 Agent 用户，我希望看到所有已创建的 Agent 列表及其记忆数量。

**验收条件：**

```gherkin
Scenario: 列出 Agent
  Given memories 表中有 agent_id "agent-1" 和 "agent-2"
  When 用户调用 list_agents
  Then 返回 Agent[]，包含 id, name, type, memoryCount
  And memoryCount 为该 agent 的记忆总数

Scenario: 无记忆的 Agent
  Given agent_id "agent-3" 在 memories 表中无记录
  When 用户调用 list_agents
  Then "agent-3" 不在返回列表中（或 memoryCount=0）
```

---

### F-010: IndexPipeline

**用户故事：**  
作为知识工作者，我希望一次索引就能让全文搜索、标签、时间线、语义搜索、知识图谱全部可用。

**验收条件：**

```gherkin
Scenario: 单文件索引
  Given workspace 已打开
  When 索引一个 Markdown 文件
  Then notes 表新增记录（id, workspace_id, file_path, title, content）
  And FTS 索引包含该文件内容
  And note_tags 表包含从文件提取的标签
  And links 表包含从文件提取的链接
  And graph_nodes/graph_edges 包含对应节点和边

Scenario: 批量索引
  Given workspace 目录下有 10 个 Markdown 文件
  When 调用 index_knowledge_base
  Then 返回 { indexed: 10, errors: [] }
  And 全文搜索能找到这 10 个文件的内容
  And get_tags 返回从这些文件提取的标签
  And get_timeline 按时间排序显示这些文件

Scenario: 排除规则
  Given workspace 配置 excludePatterns: [".git", "node_modules"]
  When 索引 workspace
  Then .git 和 node_modules 目录下的文件不被索引

Scenario: 大文件处理
  Given workspace 目录下有一个 >10MB 的文件
  When 索引 workspace
  Then 该文件被跳过，errors 中包含对应记录
```

---

### F-011: SearchService

**用户故事：**  
作为知识工作者，我希望通过全文搜索和语义搜索快速找到相关知识。

**验收条件：**

```gherkin
Scenario: 全文搜索
  Given workspace 已索引 10 个文件
  When 用户搜索 "Rust async"
  Then 返回按相关性排序的搜索结果
  And 每个结果包含 filePath, title, snippet, score
  And 只返回当前 workspace 的文件

Scenario: 语义搜索
  Given workspace 已索引文件并生成 embedding
  When 用户搜索 "如何处理并发"
  Then 返回语义相似的文件
  And 每个结果包含 filePath, title, content, score

Scenario: 标签过滤
  Given workspace 中有 5 个文件带 #rust 标签
  When 用户按 #rust 过滤
  Then 返回这 5 个文件的 FileEntry[]

Scenario: 时间线
  Given workspace 中有 10 个文件
  When 用户查看时间线
  Then 按 created_at 降序返回所有文件
```

---

### F-013: links schema 迁移

**用户故事：**  
作为开发者，我希望 links 表支持多 workspace 隔离，避免不同 workspace 的同名文件冲突。

**验收条件：**

```gherkin
Scenario: links 表结构
  Given links 表
  When 查看 schema
  Then 包含 workspace_id 字段
  And UNIQUE 约束为 (workspace_id, source_file, target_file, link_type)
  And 不再有对 notes(file_path) 的 FK

Scenario: workspace 隔离查询
  Given workspace-1 和 workspace-2 都有 "readme.md"
  When 查询 workspace-1 的 links
  Then 只返回 workspace-1 的链接
```

---

### F-014: 自动索引

**用户故事：**  
作为用户，我希望打开 workspace 后系统自动索引文件，无需手动触发。

**验收条件：**

```gherkin
Scenario: autoIndex=true 自动索引
  Given workspace 配置 autoIndex=true
  When 用户打开 workspace
  Then 系统自动调用 index_knowledge_base
  And 索引完成后全文搜索/标签/时间线可用

Scenario: autoIndex=false 不自动索引
  Given workspace 配置 autoIndex=false
  When 用户打开 workspace
  Then 系统不自动索引
  And 用户可手动触发索引
```

---

### F-020: 增量索引（watcher）

**用户故事：**  
作为用户，我希望编辑文件后系统自动更新索引，无需手动重新索引。

**验收条件：**

```gherkin
Scenario: 文件修改后自动索引
  Given workspace 已索引
  When 用户修改一个 Markdown 文件并保存
  Then 系统在 2s 内检测到变更
  And 自动重新索引该文件
  And 全文搜索/标签/时间线同步更新

Scenario: 文件创建后自动索引
  Given workspace 已打开
  When 用户在目录中创建新文件
  Then 系统自动索引新文件

Scenario: 文件删除后清理
  Given workspace 已索引
  When 用户删除一个文件
  Then 系统删除 notes 表中的对应记录
  And 清理 FTS 索引、向量、links、graph 相关数据
```

---

### F-021: RAG 知识问答

**用户故事：**  
作为用户，我希望通过自然语言提问，系统基于知识库内容给出答案并附上引用来源。

**验收条件：**

```gherkin
Scenario: 有相关知识时回答
  Given workspace 已索引包含 "Rust 错误处理" 的文件
  When 用户提问 "Rust 中如何处理错误？"
  Then 系统返回答案
  And sources 字段包含引用的文件路径列表
  And sources 不为空

Scenario: 无相关知识时提示
  Given workspace 已索引但无相关文件
  When 用户提问 "量子计算原理"
  Then 系统返回明确提示 "未找到相关知识"
  And sources 为空数组

Scenario: AI 调用日志
  Given 用户进行知识问答
  When 调用完成
  Then ai_logs 表新增记录，包含 operation, model, duration_ms, success
```

---

### F-022: jieba-rs 查询分词

**用户故事：**  
作为中文用户，我希望全文搜索支持中文分词，提高搜索准确性。

**验收条件：**

```gherkin
Scenario: 中文查询分词
  Given workspace 已索引包含 "Rust 异步编程" 的文件
  When 用户搜索 "异步编程"
  Then jieba 对查询分词为 ["异步", "编程"]
  And FTS MATCH 使用空格连接的分词结果
  And 返回相关文件

Scenario: 英文查询保持
  Given 用户搜索 "async rust"
  When 查询不含中文
  Then 直接使用原始查询进行 FTS MATCH
```

---

### F-023: API Key 安全加固

**用户故事：**  
作为用户，我希望 API Key 安全存储，不暴露在文件系统中。

**验收条件：**

```gherkin
Scenario: API Key 存储路径
  Given 用户配置 AI 模型的 API Key
  When Key 被存储
  Then 文件路径为 {app_data_dir}/secrets/{service}.key
  And 不存储在进程 CWD

Scenario: API Key 读取
  Given API Key 已存储
  When 系统需要调用 AI 服务
  Then 从安全路径读取 Key
```

---

### F-024: 备份加密

**用户故事：**  
作为用户，我希望备份数据被加密保护，防止未授权访问。

**验收条件：**

```gherkin
Scenario: 备份打包加密
  Given 用户触发备份
  When 备份执行
  Then 数据先打包为 zip 格式
  And 使用 AES-GCM 加密
  And 加密文件包含 KDF 参数头

Scenario: 备份恢复
  Given 加密备份文件
  When 用户提供密码恢复
  Then 解密并解压
  And 数据完整恢复
```

---

## 四、关键业务规则

### 4.1 Workspace 隔离规则

| 规则 | 描述 |
|------|------|
| BR-001 | 每个 workspace 有独立的 notes、tags、links、graph 数据 |
| BR-002 | 搜索/过滤/时间线查询必须带 workspace_id 参数 |
| BR-003 | 同一文件路径在不同 workspace 中可独立存在 |
| BR-004 | links 表通过 workspace_id 隔离，不依赖 notes FK |

### 4.2 索引规则

| 规则 | 描述 |
|------|------|
| BR-010 | 索引时原子更新：notes + FTS + 向量 + tags + links + graph |
| BR-011 | 排除 .git、node_modules（来自 workspace config） |
| BR-012 | 大文件（>10MB）跳过，记录到 errors |
| BR-013 | 增量索引仅处理变更的文件，不全量重建 |
| BR-014 | 文件删除时清理所有衍生数据 |

### 4.3 AI/RAG 规则

| 规则 | 描述 |
|------|------|
| BR-020 | knowledge_qa 必须有 sources，无结果时 sources=[] 并提示用户 |
| BR-021 | 每次 AI 调用写 ai_logs 表 |
| BR-022 | suggest_links JSON 解析失败返回明确错误，不静默吞掉 |
| BR-023 | configure_ai_model 应持久化到 app_config |

### 4.4 安全规则

| 规则 | 描述 |
|------|------|
| BR-030 | API Key 存于 {app_data_dir}/secrets/{service}.key |
| BR-031 | 备份使用 zip + AES-GCM 加密 |
| BR-032 | read_file/write_file 可选校验路径在 workspace 根下 |
| BR-033 | 密码使用 PBKDF2 100k 迭代 |

---

## 五、非功能需求

### 5.1 性能要求

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| 文件索引速度 | 100 个 Markdown 文件 < 5s | index_knowledge_base 返回时间 |
| 增量索引延迟 | 文件修改后 < 2s | watcher 检测到索引完成 |
| 全文搜索延迟 | < 500ms（10k 文件） | search_fulltext 返回时间 |
| 语义搜索延迟 | < 2s（10k 文件） | semantic_search 返回时间 |
| 启动时间 | < 3s | 应用启动到主界面可交互 |

### 5.2 数据库要求

| 指标 | 目标 |
|------|------|
| 并发读 | 支持多线程并发读（SQLite WAL 模式） |
| 写入安全 | Mutex<Connection> 保证写入串行化 |
| 数据完整性 | 外键约束 + 唯一索引 |
| 迁移管理 | schema_migrations 版本表 |

### 5.3 安全要求

| 指标 | 目标 |
|------|------|
| 密钥存储 | AES-GCM 加密，PBKDF2 100k KDF |
| 备份加密 | AES-GCM，zip 打包 |
| 文件访问 | 可选路径校验（workspace 根内） |
| API Key | 不暴露在日志或错误消息中 |

### 5.4 可维护性要求

| 指标 | 目标 |
|------|------|
| 代码分层 | commands ≤ 30 行，services 编排，repositories 纯 SQL |
| 模块化 | engines 可替换（FTS、向量、Ollama） |
| 契约一致性 | Contract Test 覆盖所有 command |
| 文档一致性 | README 与代码实现一致 |

### 5.5 兼容性要求

| 指标 | 目标 |
|------|------|
| macOS | 11.0+ (Big Sur) |
| Windows | 10 1809+ / Windows 11 |
| Linux | WebKitGTK 4.1+ (Ubuntu 22.04+) |
| Node.js | >= 18 |
| Rust | stable toolchain |

---

## 六、验收标准总结

### Phase 0-1 验收（基线 + 契约）

- [ ] lib.rs 为唯一入口，main.rs 仅调用 noteforge_lib::run()
- [ ] 所有 DTO 统一 camelCase（rename_all）
- [ ] list_workspaces 和 list_agents command 可用
- [ ] Contract Test 通过
- [ ] 真环境 bootstrap → 打开 workspace → memory CRUD 正常

### Phase 2 验收（数据贯通）

- [ ] 索引 10 个 md 后，fulltext/tags/timeline/semantic 均有数据
- [ ] links 表支持 workspace 隔离
- [ ] 打开 workspace 后自动索引（autoIndex=true）
- [ ] 搜索结果只返回当前 workspace 的数据

### Phase 3 验收（增量 + AI）

- [ ] 改文件后 2s 内索引更新
- [ ] QA 返回非空 sources
- [ ] 中文查询分词生效
- [ ] API Key 安全存储
- [ ] 备份真正打包加密

### Phase 4 验收（性能 + polish）

- [ ] WAL 模式 + spawn_blocking
- [ ] batch SQL 优化
- [ ] README 与代码一致

---

## 七、约束与边界

### 7.1 不做的事

| 约束 | 说明 |
|------|------|
| 不做界面设计 | 本需求不涉及 UI 布局或交互设计 |
| 不做技术方案设计 | 本需求不指定具体实现技术（如 "用 Redis"） |
| 不修改业务目标 | 本需求只细化和澄清，不改变重构方案的核心目标 |
| 不做 monorepo 拆分 | 维持 Tauri 单体架构 |

### 7.2 依赖项

| 依赖 | 说明 |
|------|------|
| Ollama | 本地 AI 推理，可选安装 |
| Tauri v2 | 桌面框架 |
| SQLite FTS5 | 全文搜索 |
| fastembed | 向量生成 |
| jieba-rs | 中文分词（Phase 2+） |

---

*文档结束*
