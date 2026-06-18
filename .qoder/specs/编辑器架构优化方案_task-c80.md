# NoteForge 编辑器架构全面优化方案

## Context

当前问题：
1. **三重内容副本**：DocumentRecord + EditorTab(Zustand) + Monaco Model 各持一份，10MB 文件占 30-50MB+
2. **每键全量替换**：onChange → updateContent → applyPatch(replace-all) → syncDocumentToEditorTabs → model.setValue，O(N) 遍历 + 全 tab re-render
3. **JSON 侧栏杀手**：TreeView/ProblemsPanel 每次变更 JSON.parse 全文
4. **脏检测全串比较**：`content !== baseline` 每渲染 O(n)
5. **无大文件策略 / 无本地历史**

目标（对齐 ADR-001）：**编辑真相只在 Editor Model 一份；业务层只记 metadata（path、revision、viewState）**

---

## Phase 1 — 核心架构改造（一步到位）

> 删除 EditorTab.content/baseline、Monaco 非受控、revision 脏检测、精准同步。不搞过渡层。

### Task 1.1: DocumentRecord 添加 revision 字段

**文件**: `src/core/document/types.ts`

- `DocumentRecord` 添加 `revision: number`（初始 0）、`savedRevision: number`（初始 0）、`fileSize: number`、`tier: FileTier`
- `dirty` 语义不变，但计算方式改为 `revision !== savedRevision`

**新建**: `src/core/document/file-tier.ts`
```typescript
export type FileTier = "normal" | "large" | "huge";
export const LARGE_THRESHOLD = 2 * 1024 * 1024;
export const HUGE_THRESHOLD = 20 * 1024 * 1024;
export function getFileTier(byteSize: number): FileTier;
export function getTierConfig(tier: FileTier): TierConfig;
```

### Task 1.2: DocumentService 内部 revision 递增

**文件**: `src/core/document/document-service.impl.ts`

- `applyContent`: `revision++`，`dirty = revision !== savedRevision`
- `save`: `savedRevision = revision`，`dirty = false`
- `revert`: `content = baseline`，`revision = savedRevision`
- `open`: 记录 `fileSize`、计算 `tier`
- `notifyChange()` → `notifyChange(documentId)` — 只通知变更的那个文档

### Task 1.3: EditorTab 删除 content 和 baseline

**文件**: `src/store/editor.ts`

- `EditorTab` 接口直接删除 `content: string` 和 `baseline: string`
- 添加 `bufferRevision: number` 和 `savedRevision: number`
- `isDirty(tab)` 改为 `tab.bufferRevision !== tab.savedRevision`
- `updateContent`: 删除直接写 tab.content 的分支，全部走 DocumentService
- `saveTab`/`saveTabAs`: 从 `DocumentService.get(id).content` 获取内容写盘
- `duplicateTab`: 分屏复用相同 `documentId`（修复 ADR-004 违规）

### Task 1.4: syncDocumentToEditorTabs 只同步元数据

**文件**: `src/core/bridge/editor-sync.ts`

- 函数内删除 `content`、`baseline` 的同步赋值
- 只同步 `language`、`displayName`、`path`、`surfaceMode`、`kind`、`bufferRevision`、`savedRevision`
- 删除 `applyExternalContent` 在此函数中的调用 — 内容推送改为仅在需要时（revert/外部变更）由调用方单独触发
- `ensureDocumentTabInPane`: 首次打开时通过 EditorHost 注入内容到 Monaco

### Task 1.5: runtime.ts 精准回调

**文件**: `src/core/runtime.ts`

- `onDocumentsChanged` 签名改为 `(documentId: DocumentId) => void`
- 回调体内：只同步变更的那一个文档，不遍历所有

### Task 1.6: Monaco 非受控 + debounce

**文件**: `src/components/editor/MonacoEditor.tsx`

- 删除 `value={tab.content}`
- `onMount` 时 `model.setValue(initialContent)` — 仅一次
- `onChange` → 200ms debounce → `updateContent(tabId, model.getValue())`
- 删除 useEffect 中 tab.content 变更时 model.setValue 的逻辑
- 保留 `applyExternalContent` handle 用于 revert/外部变更
- 根据 `DocumentRecord.tier` 动态 Monaco options（大文件关 minimap/folding/校验等）
- flush 保证点：save / tab 切换关闭 / mode 切换 / 退出 — 都强制 flush pending buffer

### Task 1.7: 所有 tab.content 消费者直接改为从 DocumentService 读取

直接改，不搞 helper 过渡：

| 文件 | 原读取 | 改为 |
|------|--------|------|
| `src/core/session/scratch-autosave.ts` | `tab.content` | `getCore().document.get(docId).content` |
| `src/core/session/workspace-draft-autosave.ts` | 已读 doc.content | 不变 |
| `src/features/json-yaml/TreeView.tsx` | `tab.content` prop | `useDocumentContent(documentId)` |
| `src/components/editor/ProblemsPanel.tsx` | 遍历 `tab.content` | `document.list()` 获取 |
| `src/components/editor/JsonYamlPanel.tsx` | `tab.content` | `useDocumentContent(documentId)` |
| `src/components/right/OutlinePanel.tsx` | `tab.content` | `useDocumentContent(documentId)` |
| `src/components/right/RightPanel.tsx` | `tab.content` | `useDocumentContent(documentId)` |

**新建**: `src/hooks/useDocumentContent.ts` — 订阅 document:changed 事件的 React hook，返回 `DocumentRecord.content`

### Task 1.8: 大文件面板降级

**文件**: TreeView.tsx, ProblemsPanel.tsx, OutlinePanel.tsx, JsonYamlPanel.tsx

- 大文件 (>2MB): TreeView 不 parse，显示占位提示
- ProblemsPanel 跳过大文件校验
- OutlinePanel 跳过大文件扫描
- 单行巨行 JSON: 提示"建议先格式化"
- draft debounce 根据 tier 动态调整：normal 1.5s → large 10s → huge 30s

### Task 1.9: 会话恢复适配

**文件**: `src/core/workbench/workbench-service.impl.ts`

- `restoreTabRef`: 打开 document → 通过 EditorHost 注入内容到 Monaco（不再走 tab.content）
- `buildSession`: 只序列化 metadata（已有，不变）

### 验证
- `pnpm lint` — 0 warnings
- `pnpm build` — TypeScript + Vite 通过
- 快速打字 100 字符 → Ctrl+S → 内容完整
- Tab 切换再切回 → 内容不丢失
- write/source 模式切换 → 内容正确
- Tab 黄点 dirty 标记正确
- Revert / 冲突对话框正常
- React DevTools：10 tab 中一个快速打字，其他无 re-render
- 3MB JSON: TreeView 降级提示，ProblemsPanel 跳过

---

## Phase 2 — 增强层（Model 卸载 + 只读预览 + 分屏修复）

### Task 2.1: 非活跃 tab Monaco Model 卸载

**文件**: MonacoEditor.tsx, EditorArea.tsx

- 非活跃 tab 卸载 Monaco 实例
- 切回时从 DocumentRecord 重新注入
- 用已有 `captureViewState`/`restoreViewState` 保留光标/滚动
- 同时活跃的大文件 Monaco 实例 ≤ 2

### Task 2.2: Huge 文件只读预览

**新建**: `src/components/editor/LargeFilePreview.tsx`

- 显示文件信息（大小、行数、语言）
- 只读前 1000 行
- "在外部编辑器打开"按钮（Tauri shell）
- "强制可编辑"选项（确认警告后）

### Task 2.3: Rust 侧 file_stat + read_file_range

**文件**: `src-tauri/src/commands/file.rs`

```rust
pub struct FileStat { size: u64, mtime: String, line_count_estimate: u64 }
pub fn file_stat(path: String) -> Result<FileStat>;
pub fn read_file_range(path: String, offset: u64, length: u64) -> Result<String>;
```

**文件**: `src/core/document/document-service.impl.ts` — open 前先 stat 确定 tier，Huge 文件 readOnly

**文件**: `src/ipc/index.ts` — 添加 `fs.stat`

### Task 2.4: Draft 存储优化

- 大文件 draft 存原始文本，不 JSON 包一层
- draft 对比改用 hash(mtime+size)，避免全量 strcmp

### 验证
- 20 tab 内存减少 40%+
- 分屏同文件修改实时同步
- 25MB 文件只读预览
- 50MB 文件打开不卡死

---

## Phase 3 — Local History（跨重启版本回滚）

### Task 3.1: Rust — LocalHistoryStore

**新建**: `src-tauri/src/local_history.rs`

```rust
pub struct LocalHistoryStore { root: PathBuf }
// {app_data}/history/{hash(vaultPath)}/{timestamp}.snapshot + meta.json
fn save_snapshot(vault_path, content) -> SnapshotMeta
fn list_snapshots(vault_path) -> Vec<SnapshotMeta>
fn load_snapshot(vault_path, timestamp) -> String
fn prune_snapshots(vault_path, max_count, max_age_days)
fn delete_history(vault_path)
```

**新建**: `src-tauri/src/commands/local_history.rs` — 5 个 Tauri 命令
**修改**: `src-tauri/src/main.rs` — init + 注册
**保留策略**: 50 版本 或 30 天

### Task 3.2: 前端 — Local History Service

**新建**: `src/core/local-history/` — `types.ts` + `service.ts`
**修改**: `src/ipc/index.ts` + `src/ipc/stub.ts` — history 命名空间

**快照触发**:
1. 手动保存后
2. 5 分钟自动间隔（仅 dirty）
3. Draft flush 成功后

### Task 3.3: Timeline UI 面板

**新建**: `src/features/timeline/TimelinePanel.tsx`

- 历史版本列表（时间戳、大小）
- 点击显示 diff（用 `diff` 库）
- "恢复此版本"按钮
- 集成到 RightPanel `"timeline"` 模式

### 验证
- 保存后 history/ 出现 snapshot
- Timeline 显示历史、diff 正确、恢复正确
- prune 正常
- `cargo test` 通过

---

## 关键文件索引

### 修改
| 文件 | Phase | 改动 |
|------|-------|------|
| `src/store/editor.ts` | 1 | 删 content/baseline、revision 脏检测、分屏修复 |
| `src/core/document/types.ts` | 1 | 加 revision/savedRevision/fileSize/tier |
| `src/core/document/document-service.impl.ts` | 1,2 | revision 递增、notifyChange 精准、open 加 stat |
| `src/core/bridge/editor-sync.ts` | 1 | 只同步元数据，删 content/baseline 同步 |
| `src/core/runtime.ts` | 1 | onDocumentsChanged 精准回调 |
| `src/components/editor/MonacoEditor.tsx` | 1,2 | 非受控、debounce、tier 配置、卸载 |
| `src/core/session/scratch-autosave.ts` | 1 | 从 doc 获取内容 |
| `src/core/session/workspace-draft-autosave.ts` | 1,2 | 动态防抖、hash 比较 |
| `src/features/json-yaml/TreeView.tsx` | 1 | 大文件降级、数据源改 doc |
| `src/components/editor/ProblemsPanel.tsx` | 1 | 大文件跳过、数据源改 doc |
| `src/components/editor/JsonYamlPanel.tsx` | 1 | 数据源改 doc |
| `src/components/right/OutlinePanel.tsx` | 1 | 数据源改 doc |
| `src/components/right/RightPanel.tsx` | 1,3 | 数据源改 doc、加 timeline 入口 |
| `src/core/workbench/workbench-service.impl.ts` | 1 | 恢复走 EditorHost 注入 |
| `src/ipc/index.ts` | 2,3 | fs.stat + history |
| `src/ipc/stub.ts` | 3 | history stub |
| `src-tauri/src/main.rs` | 2,3 | 注册新命令 |
| `src-tauri/src/commands/file.rs` | 2 | file_stat、read_file_range |

### 新建
| 文件 | Phase | 职责 |
|------|-------|------|
| `src/core/document/file-tier.ts` | 1 | 文件分级 |
| `src/hooks/useDocumentContent.ts` | 1 | 文档内容订阅 hook |
| `src/components/editor/LargeFilePreview.tsx` | 2 | 大文件只读预览 |
| `src-tauri/src/local_history.rs` | 3 | 历史存储 |
| `src-tauri/src/commands/local_history.rs` | 3 | 历史命令 |
| `src/core/local-history/service.ts` | 3 | 前端历史服务 |
| `src/core/local-history/types.ts` | 3 | 历史类型 |
| `src/features/timeline/TimelinePanel.tsx` | 3 | Timeline UI |

---

## 预期收益

| 指标 | 当前 | Phase 1 后 | Phase 2 后 |
|------|------|-----------|-----------|
| 10MB 文件内存 | ~35MB | ~12MB | ~12MB |
| 每按键 React re-render | 全部 tab + 面板 | 仅 Monaco | 仅 Monaco |
| isDirty | O(n) 串比较 | O(1) 整数 | O(1) |
| 20 tab Monaco | 20 常驻 | 20 常驻 | 仅活跃 1-2 |

---

## 验证总清单

每 Phase 完成后：
1. `pnpm lint` — 0 warnings
2. `pnpm build` — tsc + vite 通过
3. `cd src-tauri && cargo test`（Phase 2/3）
4. 功能回归：打开/编辑/保存/关闭/revert/冲突解决/会话恢复/draft/scratch/分屏
5. Phase-specific 验证项见各 Phase 末尾
