# NoteForge 编辑器系统审计与优化方案

> **文档性质**：临时审计记录（生成于 2026-06-03）  
> **范围**：`src/core/*` 编辑器/工作台链路、`src/components/editor/*`、`src-tauri` 持久化与 IPC  
> **对照基准**：`.qoder/specs/编辑器架构优化方案_task-c80.md`、VS Code / Obsidian / Zed 等业内实现

---

## 一、执行摘要

NoteForge 已完成 **Phase 1 核心架构改造**（tab 去内容化、revision 脏检测、Monaco 非受控、大文件分级、Layer A/B 持久化、Huge 懒加载、会话延迟恢复）。整体分层清晰：**Vault（磁盘）→ Document（业务状态）→ EditorHost（Surface 适配）→ Zustand（UI 元数据）**。

但相对 spec 目标「**编辑真相只在 Editor Model 一份**」，当前仍存在 **DocumentRecord + Surface Model 双份持有**，且若干 **冲突/同步/安全** 路径处于「已实现骨架、未接通」或「静默降级」状态，存在 **数据一致性隐患** 与 **功能自洽缺口**。

| 优先级 | 问题域 | 影响 |
|--------|--------|------|
| **P0** | 外部变更 + 脏文档静默忽略；`document:conflict` 死代码 | 协作/外部编辑时可能覆盖或丢失用户修改 |
| **P0** | 分屏 Monaco 不同步 | 同一文件双 pane 内容分叉 |
| **P1** | 双份内容 + `disk.content` 全量缓存 | 大文件内存 2–3×，与 spec 目标背离 |
| **P1** | Vault watcher 仅 stat 修订号 | 等大小内容变更检测不到 |
| **P1** | Rust IPC 无 workspace 路径沙箱 | 任意绝对路径读写（Tauri 权限模型依赖 OS） |
| **P2** | 退出流程、历史快照、知识索引与 buffer 滞后 | 体验与数据新鲜度问题 |
| **P2** | Workbench stub、Timeline 无 diff | 功能不完整 |

---

## 二、当前架构剖析

### 2.1 模块划分

```
┌─────────────────────────────────────────────────────────────┐
│  React UI                                                    │
│  editor / workspace / ui / large-file-overrides / theme      │
│  MonacoEditor · MilkdownSurface · Panels · DialogHost        │
└──────────────────────────┬──────────────────────────────────┘
                           │ bridge/editor-sync.ts
┌──────────────────────────▼──────────────────────────────────┐
│  Core Runtime (composition root)                             │
│  EventBus → Vault → Document → Workbench → EditorHost        │
│           → Dialog · Commands · KnowledgeQuery                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ src/ipc/index.ts
┌──────────────────────────▼──────────────────────────────────┐
│  Tauri Backend                                               │
│  file · workspace_draft · scratch · workbench_session          │
│  local_history · vault_watch · knowledge/db                  │
└─────────────────────────────────────────────────────────────┘
```

**关键文件索引**

| 模块 | 职责 | 核心文件 |
|------|------|----------|
| Document | 内容、revision、tier、打开/保存/冲突 | `document-service.impl.ts`, `types.ts`, `file-tier.ts` |
| Vault | FS、自写抑制、watch | `vault-service.impl.ts`, `vault-watch.ts` |
| Workbench | session v2、延迟 tab 水合 | `workbench-service.impl.ts`, `session-storage.ts` |
| EditorHost | Surface 注册、flush、外部内容推送 | `editor-host.impl.ts`, `monaco-slot.ts` |
| Bridge | tab↔document 元数据同步 | `editor-sync.ts` |
| Session | Layer A 草稿 / scratch | `workspace-draft-autosave.ts`, `scratch-autosave.ts` |
| Local History | 快照 | `local-history/service.ts`, `local_history.rs` |

### 2.2 数据流（已实现）

**打开**：`readStat` → tier 判定 → huge 懒开 / 全量 `readText` → draft 冲突解析 → `DocumentRecord` → `pushContentToSurface`

**编辑**：Surface debounce(200ms) → `applyPatch(replace-all)` → `revision++` → `document:changed` → draft autosave

**保存**：`flushAllSurfacesForDocument` → `ensureContentLoaded` → baseline 冲突检测 → `vault.writeText` → 删 draft → local history

**会话恢复**：active tab 全量 open；inactive `pendingRestore` shell → `hydrateDeferredTab` 首次激活

### 2.3 ADR 落地情况

| ADR | 声明 | 实际 |
|-----|------|------|
| ADR-001 | 真相只在 Editor Model | **部分**：已去 tab.content，DocumentRecord 仍为 canonical |
| ADR-002 | Document 管内容/dirty，Vault 管路径 | **已落地** |
| ADR-004 | 一 path 一 Document，分屏共享 documentId | **已落地** |
| ADR-005 | 模式切换 flush | **已落地** |
| ADR-006 | 完整 session 持久化 | **已落地**（pin/reorder 仍 stub） |

---

## 三、与业内开源方案对比

### 3.1 VS Code

| 维度 | VS Code | NoteForge 现状 | 差距 |
|------|---------|----------------|------|
| 文本模型 | `ITextModel` 单例，多 Editor 附着 | DocumentRecord + 各 Surface Model | 双份内存；无 Model 级多视图 |
| 脏检测 | model 版本号 + undo 栈 | revision 计数 | 类似思路，但 Document 仍持全文 |
| 外部变更 | FileWatcher → `ETag`/`mtime` → 冲突 UI | dirty 时 **直接 return**；conflict API **未写入** | 严重缺口 |
| 大文件 | 语义高亮降级、Search 限制 | tier + overrides + preview | 方向正确，可继续深化 |
| 退出 | 脏 tab 队列 + Save 对话框 | workspace 脏 tab **静默 flush draft**；`closeTabQueueReason=app-exit` **从未设置** | 行为与 VS Code 不一致，scratch 退出无确认 |

**可借鉴**：`TextFileEditorModel` 模式——磁盘快照 + buffer 版本 + `saveParticipant`；`IFileService` 统一 watch + stat + hash。

### 3.2 Obsidian

| 维度 | Obsidian | NoteForge |
|------|----------|-----------|
| Vault 中心 | 一切围绕 vault 路径 | 一致 |
| 编辑缓冲 | CodeMirror 6 单 buffer | Monaco/Milkdown 各一套 |
| 外部同步 | 修改检测 + 提示重载 | 仅 clean 文档自动重载 |
| 插件隔离 | 严格 API 边界 | core 与 store 仍有交叉 import |

**可借鉴**：vault 事件总线 + 「文件已在外部修改」横幅；避免在 `DocumentRecord` 存 `disk.content` 全文。

### 3.3 Zed / Helix

| 维度 | Zed | NoteForge |
|------|-----|-----------|
| 多 pane 同步 | 共享 Buffer + 订阅变更 | Milkdown 订阅 `document:changed`；**Monaco 未订阅** |
| 协作/冲突 | CRDT / 操作变换（远期） | 无 |
| 索引 | 后台线程增量 | 全量 `reindexAll` debounce 1.5s |

**可借鉴**：Buffer 变更事件驱动所有 View 更新；索引增量 patch 而非全库重建。

---

## 四、隐藏问题与漏洞（详单）

### 4.1 P0 — 数据一致性

#### 问题 A：外部文件变更在脏文档时被静默忽略

**位置**：`document-service.impl.ts` → `notifyExternalChange`

```typescript
if (record.dirty) return;  // 无事件、无 UI、无 conflicts 记录
```

**风险**：用户本地未保存编辑时，磁盘文件被 git/其他工具修改，应用无任何提示；用户 Save 时走 `baseline` 冲突对话框，但 baseline 可能是旧磁盘内容，与「实时外部变更」认知不一致。

**根因**：`conflicts` Map 仅有 `delete/get/resolve`，**全代码库无 `conflicts.set()`**；`document:conflict` 事件在 `runtime.ts` 订阅但 **永远不会 emit**。

**优化方案（详细）**：

1. **新增 `stageExternalConflict(record, diskContent, diskRevision)`**  
   - 写入 `ConflictInfo { reason: 'external', localContent, diskContent, diskRevision }`  
   - `eventBus.emit({ type: 'document:conflict', ... })`  
   - 不自动覆盖 `record.content`

2. **脏文档策略（对齐 VS Code）**  
   - 选项 A：仍允许编辑，状态栏显示「磁盘已变更」+ 提供 Compare / Reload / Merge  
   - 选项 B：冻结自动重载，仅提示（当前 clean 路径保持）

3. **实现 `ConflictDialog`**（已有 `kind: "conflict"` 骨架）  
   - 三选一：保留本地 / 从磁盘重载 / 打开 diff 视图（Phase 3）

4. **测试用例**  
   - dirty + external mtime 变化 → 对话框出现  
   - clean + external → 自动 reload（现有行为）  
   - huge + unloaded → 仅更新 stat + 横幅

---

#### 问题 B：分屏 Monaco 实时不同步

**位置**：`MilkdownSurface.tsx` 订阅 `document:changed` 并 `applyExternalContent`；`MonacoEditor.tsx` **无等价订阅**。

**场景**：Pane A、Pane B 同时打开同一 JSON/Markdown-source；A 编辑后 debounce 写入 Document；B 的 Monaco Model 仍为旧值。切换 pane 会 remount 并从 `doc.content` 注入——**若 B 仍为 active tab 则不同步**。

**优化方案**：

1. **短期（最小改动）**：在 `MonacoEditor` 增加与 Milkdown 相同的 `document:changed` 订阅  
   ```typescript
   useEffect(() => {
     const unsub = eventBus.subscribe("document:changed", (e) => {
       if (e.documentId !== tab.documentId) return;
       const doc = getCore().document.get(tab.documentId);
       if (!doc?.contentLoaded) return;
       hostHandleRef.current?.applyExternalContent(doc.content);
     });
     return unsub;
   }, [tab.documentId]);
   ```
   - 注意：需 `revision` 或 `content` 比较，避免 echo 回环  
   - 使用 `model.pushEditOperations` 替代 `setValue` 以保留 undo（中期）

2. **中期**：`EditorHost` 统一订阅 `document:changed`，对所有已注册 handle 推送（单一入口，DRY）

3. **长期（ADR-001 完整）**：引入 `TextBuffer` 抽象，Monaco `ITextModel` 与 Document 共享或通过 patch 桥接

---

#### 问题 C：`applyPatch` 在 `!contentLoaded` 时静默丢弃

**位置**：`document-service.impl.ts` → `applyPatch`

```typescript
if (!record || !record.contentLoaded) return;
```

**风险**：Huge 预览态若 UI 有漏洞允许输入，编辑会丢失。

**优化方案**：
- UI 层只读锁定（已有 `LargeFilePreview`）  
- Service 层：`throw` 或返回 `false` + 日志  
- `applyPatch` 对 huge unloaded 返回明确错误码供 UI toast

---

### 4.2 P1 — 架构与性能

#### 问题 D：双份（实为三份）内容内存

**现状**：
- `DocumentRecord.content` — 编辑 canonical
- `DocumentRecord.baseline` — 保存冲突检测
- `DocumentRecord.disk.content` — 打开时磁盘快照全文

10MB 文件 ≈ 20–30MB+（加 Monaco model）。

**对比 spec**：Phase 1 目标已从「三重」降为「双重」，但未达「仅 Model」。

**优化方案（分阶段）**：

| 阶段 | 动作 | 预期收益 |
|------|------|----------|
| D1 | 删除 `disk.content`，仅保留 `disk.revision/mtime/size` | 打开时 -1 份全文 |
| D2 | `baseline` 改为 `baselineRevision` + 按需 `readText` | 再 -1 份；保存时多读一次盘 |
| D3 | Document 不存 `content`，仅 `revision`；flush 时从 Surface 取 | 达成 ADR-001 |
| D4 | `applyPatch` 支持 `replace-range` / Monaco `onDidChangeContent` delta | 键盘路径 O(1) |

**D1 实现要点**：
```typescript
disk: { revision, mtime, encoding, eol }  // 去掉 content
// save 冲突：await vault.readText() 与 record.content 比较
```

---

#### 问题 E：Vault watcher 仅 stat 修订号

**位置**：`vault-service.impl.ts` → `buildStatRevision(mtime, size)`

**盲区**：内容变化但 size+mtime 不变（罕见）或 mtime 精度不足；**等大小替换**完全检测不到。

**优化方案**：

1. **Tier 策略**  
   - normal：变更后异步 `hash(first+last 64KB)` 或全文 hash（debounce）  
   - large/huge：仅 stat + 用户手动「重新加载」

2. **打开文件 track 列表**：watch 事件触发时，对 tracked path 做 cheap hash

3. **对标 VS Code**：`etag = mtime + size` 用于快速路径；保存前 `readText` 做最终冲突检测（已有）

---

#### 问题 F：Rust 文件 IPC 无 workspace 根路径约束

**位置**：`src-tauri/src/commands/file.rs` → `ensure_real_file_path` 仅拒绝 `untitled:` 和 `://`

**风险**：前端若被 XSS/恶意扩展传入 `/etc/passwd` 等路径，Tauri 将尝试读写（取决于 OS 权限）。

**优化方案**：

1. `AppState` 持有 `current_workspace_root: PathBuf`
2. 所有 file/draft/history 命令：`canonicalize` 后验证 `path.starts_with(root)`  
3. draft/history 使用 app_data 内哈希路径（已部分实现）  
4. 增加 `cargo test` 路径穿越用例：`../../../etc/passwd`

---

#### 问题 G：本地历史 / 草稿快照内容滞后

**位置**：
- `local-history/service.ts` → `getContent()` 读 `DocumentRecord.content`
- Monaco debounce 200ms，draft debounce 1.5s–30s

**风险**：崩溃时最后 200ms–30s 编辑可能不在 history/draft 中（draft 有 flush on close 缓解）。

**优化方案**：
1. `saveHistorySnapshot` / `scheduleWorkspaceDraftAutosave` 前 **强制 `flushAllSurfacesForDocument`**
2. `flushBeforeExit` 已做；autosave 定时器也应 flush
3. 对标 VS Code：backup 服务在 debounce 前取 model.getValue()

---

#### 问题 H：知识索引未订阅 `document:changed`

**位置**：`wireKnowledgeIndexer` 仅监听 `document:saved`、`vault:*`

**影响**：`getHeadings` / `getOutgoingLinks` 读 `DocumentRecord.content`——编辑中 outline/wiki 链接可能滞后；保存前索引一直旧。

**优化方案**：
1. 增加 `document:changed` debounce → 单文件增量 index API（需 Rust 侧支持）  
2. 短期：`getHeadings` 优先读 **活跃 Surface flush 内容** 或 Document content（接受 200ms 滞后）  
3. 长期：索引只信磁盘 + 保存事件（Obsidian 模式），编辑态 outline 单独解析 buffer

---

### 4.3 P2 — 功能缺口与体验

#### 问题 I：应用退出脏 tab 队列死代码

**位置**：`editor.ts` → `requestAppExit` 直接 `return true`；`closeTabQueueReason = "app-exit"` 从未赋值

**现状**：workspace 脏 tab 靠 draft flush；scratch 脏 tab **退出无确认**

**优化方案**：
1. 明确产品决策并文档化：workspace = silent draft，scratch = confirm  
2. 若需 scratch 退出确认：在 `requestAppExit` 中设置 queue + `processCloseTabQueue`  
3. 删除未使用的 `advanceAppExitQueue` 或接通

---

#### 问题 J：`revert` revision 语义不一致

**位置**：`revert` 设置 `savedRevision = record.revision`，不重置 `revision`

**影响**：功能正确（dirty=false），但 revision 单调递增无意义增长

**优化方案**：`revert` 时 `revision = savedRevision`（或 save 时对齐），保持审计清晰

---

#### 问题 K：Deferred tab 占位 `documentId`

**位置**：`mountDeferredTabShell` → `documentId: deferred-${tabId}`

**风险**：`useDocumentRecord`、large-file overrides 在 hydration 前拿到 null/错误 id

**优化方案**：
- 占位 id 不参与 document store；面板用 `tab.path` 判断  
- 或 hydration 完成前不渲染依赖 documentId 的面板

---

#### 问题 H：会话恢复 `restoreSession: true` 自动偏好 draft

**位置**：`resolveInitialWorkspaceContent` bootstrap 分支

**设计意图**：避免 splash 后对话框卡死（已修复）

**副作用**：真实 draft/disk 冲突在重启时被静默合并为 draft

**优化方案**：
- 启动后 `sessionRestored` 完成，对「bootstrap 跳过的冲突」打标 `pendingConflictReview`  
- 工作台就绪后 toast + 非阻塞冲突条

---

#### 问题 M：Workbench API stub

**位置**：`pinTab`、`reorderTab` Phase 0 stub

**优化方案**：实现或从 public API 移除，避免调用方误用

---

#### 问题 N：Timeline 无 diff

**spec Phase 3** 要求 diff 预览；当前仅文本展示

**优化方案**：集成 `diff` 库或 Monaco DiffEditor 只读对比 snapshot vs 当前

---

#### 问题 O：Monaco `applyExternalContent` 使用 `setValue`

**影响**：丢失 undo 栈；大文件 setValue 卡顿

**优化方案**：`pushEditOperations` 计算 minimal edit；或 diff 后应用

---

#### 问题 P：浏览器 stub 与 Tauri 行为漂移

**位置**：`src/ipc/stub.ts` 大量内存模拟

**风险**：开发环境通过、桌面端失败

**优化方案**：关键路径 contract test 已有；补充 stub 的 `fileStat`/`readFileRange`/draft raw 与 Rust 对齐测试

---

#### 问题 Q：Zustand selector 不稳定引用

**已修复**：`large-file-overrides` 的 `?? []`  
**预防**：eslint rule 或 code review 检查 selector 内联对象/数组

---

## 五、模块级优化路线图

### 5.1 DocumentService

```
[现状] open → readDiskIntoRecord → triple content
[目标] open → stat + tier → lazy/hydrate → single buffer authority

任务：
1. 移除 disk.content（P1-D1）
2. 实现 conflicts.set + notifyExternalChange 脏路径（P0-A）
3. applyPatch replace-range（P1-D4）
4. ensureContentLoaded 统一入口 + 错误语义（P0-C）
```

### 5.2 EditorHost / Surfaces

```
任务：
1. document:changed → 所有 surface 同步（P0-B）
2. flush 纳入 autosave/history 链路（P1-G）
3. Monaco undo-safe external apply（P2-O）
4. 非活跃 tab：已 unmount；切回从 Document 注入——待 D3 后改为 Model 池化
```

### 5.3 VaultService

```
任务：
1. tracked 文件 optional content hash（P1-E）
2. selfWritePaths 窗口：write 完成后再延迟 untrack 50ms（防 race）
3. workspace root 校验下沉到 Rust（P1-F）
```

### 5.4 Workbench / Session

```
任务：
1. bootstrap 冲突延迟审查（P2-L）
2. pinTab / reorderTab 实现或删除（P2-M）
3. session 版本迁移文档
```

### 5.5 Local History

```
任务：
1. flush-before-snapshot（P1-G）
2. Timeline DiffEditor（P2-N）
3. huge 文件：仅快照 stat + 用户触发全文快照
```

### 5.6 Knowledge

```
任务：
1. 明确「编辑态」vs「索引态」数据源（P1-H）
2. 单文件增量 index API
3. document:changed debounce 可选触发
```

---

## 六、推荐实施顺序（保证功能自洽）

### Sprint 1 — 一致性修复（P0）

1. 接通 `conflicts.set` + 外部变更冲突 UI  
2. Monaco `document:changed` 订阅（或 EditorHost 统一推送）  
3. `applyPatch` 对 unloaded 明确失败  
4. 回归：双 pane 同文件、外部 git checkout、dirty 保存冲突

### Sprint 2 — 内存与 watch（P1）

1. 移除 `disk.content`  
2. autosave/history 前 flush  
3. Vault hash 增强（可选 tier）  
4. Rust workspace path 沙箱

### Sprint 3 — 体验完善（P2）

1. 启动后 deferred conflict review  
2. Timeline diff  
3. Workbench pin/reorder  
4. `revert` revision 语义清理

### Sprint 4 — ADR-001 完整（战略）

1. Document 去 `content` 字段  
2. replace-range / delta sync  
3. TextBuffer 抽象 + 测试矩阵

---

## 七、测试矩阵（审计建议）

| 场景 | 期望 | 当前风险 |
|------|------|----------|
| 双 pane 编辑同一 JSON | 实时同步 | Monaco 不同步 |
| 编辑中外部修改文件 | 冲突提示 | 静默忽略 |
| 3MB JSON 打开 | 树视图默认关、可手动开 | 已修复 |
| 25MB huge 打开 | 预览、强制编辑 | 内存尖峰 |
| 会话 20 tab 恢复 | 秒开、active 可编辑 | 延迟水合 OK |
| 关闭脏 workspace tab | draft 落盘 | OK |
| 关闭脏 scratch tab | 确认框 | OK |
| 应用退出脏 scratch | 应确认？ | **无确认** |
| JSON 格式化 | Monaco 更新 | 已修复 |
| Tab 条滚动到 active | 恢复后可见 | 已修复 |
| ProblemsPanel/StatusBar | 无无限循环 | 已修复 |
| git 同 size 改内容 | 检测变更 | **可能漏** |
| path traversal IPC | 拒绝 | **未校验** |

---

## 八、安全与合规清单

| 项 | 状态 | 建议 |
|----|------|------|
| SQL 注入 | N/A（本地 SQLite 参数化） | 保持 |
| 路径穿越 | **未防护** | workspace root 校验 |
| 密钥文件入库 | 需确认 `.gitignore` | 禁止 `test-service.key` 提交 |
| 日志敏感信息 | 检查 `JSON.stringify` 大 content | 脱敏/截断 |
| 循环 RPC | 知识 reindex 全量 | 增量+防抖已部分有 |
| 事务+锁 | 编辑器无 DB 事务混用 | 保持分离 |

---

## 九、结论

NoteForge 编辑器架构 **方向正确、Phase 1 落地扎实**，大文件分级、草稿双层持久化、延迟会话恢复等设计达到业内中等偏上水平。当前最大短板不是「能不能用」，而是 **多视图一致性** 与 **外部协作场景下的冲突治理** 尚未闭环。

**优先修复 P0 三项**（冲突接通、Monaco 同步、unloaded 语义）后，系统可达到「功能自洽」基线；再推进内存优化与 Rust 沙箱，可向 VS Code 级可靠性靠拢。

---

## 附录 A：关键代码锚点

| 主题 | 文件:行号（约） |
|------|----------------|
| 脏时跳过外部变更 | `document-service.impl.ts:559` |
| conflicts 从未 set | `document-service.impl.ts:53-629` |
| applyPatch unloaded | `document-service.impl.ts:406-408` |
| Milkdown 同步 | `MilkdownSurface.tsx:195-200` |
| Monaco 无同步 | `MonacoEditor.tsx`（缺 subscription） |
| requestAppExit | `editor.ts:437-447` |
| stat-only watch | `vault-service.impl.ts:44-57` |
| Rust path 检查 | `file.rs:5-11` |
| disk.content 存储 | `document-service.impl.ts:193-198` |

## 附录 B：参考资源

- VS Code: `TextFileEditorModel`, `IFileService.watch`
- Obsidian: vault adapter, file conflict modal
- Zed: `Buffer`/`Excerpt` multi-pane architecture
- 本项目 spec: `.qoder/specs/编辑器架构优化方案_task-c80.md`

---

*本文档为临时审计产物，实施完成后可归档或删除。*
