# Agent 内存管理 — 交互原型 & 高保真

## 1. 入口

Sidebar 二级面板，`mode="memory"`：

```
Sidebar Icons: [📁] [🤖] [🌐]  → 点击 🤖 切换到 MemoryPanel
```

## 2. MemoryPanel — 高保真

```
┌──────────────────────────────────────┐
│ Agent 记忆管理                   [+] │
├──────────────────────────────────────┤
│                                       │
│  [全部(42)] [Claude(18)] [GPT(15)] [Mistral(9)]  [+]导入 │
│                                       │
├──────────────────────────────────────┤
│  全部记忆 (42 条)          [☰ ▼] [▼] │
│  ────────────────────────             │
│                                       │
│  今天 ──── (3) ──────────────────     │
│  │                                   │
│  │  ● Claude · fact                  │
│  │  RAG pipeline config              │
│  │  RAG 管线使用 Top-K=5...          │
│  │  2h ago  #rag #config             │
│  │                                   │
│  │  ○ GPT · conversation             │
│  │  User preference: dark mode       │
│  │  用户喜欢暗色主题编辑器...          │
│  │  1h ago  #preference              │
│  │                                   │
│                                       │
│  昨天 ──── (1) ──────────────────     │
│  │                                   │
│  │  ● Mistral · procedure            │
│  │  Code review checklist            │
│  │  每次 MR 前检查: lint...           │
│  │  1d ago  #code-review             │
│  │                                   │
│                                       │
│  更早 ──── (5) ───────────────────    │
│  │                                   │
│  │  ...                              │
│                                       │
├──────────────────────────────────────┤
│  [+ 新建记忆]                         │
└──────────────────────────────────────┘
```

## 3. Agent 卡片区

```
[   ● 全部        ]  [● Claude ]  [● GPT  ]  [● Mistral]  [+]导入
    42 条            18 条         15 条        9 条
```

### Agent 卡片状态

```
Default:  58×88px, border-border, text-left
Selected: border-accent, bg-bg-tertiary (底边框高亮)
Hover:    border-accent-hover
Color dot: 每个 Agent 有 unique color (--color-accent  or custom)
```

### 交互

| 操作 | 行为 |
|------|------|
| 点击 Agent | `setActiveAgent(agentId)` → 过滤记忆列表 |
| 点击"全部" | 显示所有 Agent 的记忆 |
| 点击"导入" | `setImportWizardOpen(true)` |
| 右滑查看更多 | overflow-x-auto |

## 4. 时间线视图

### 4.1 视图切换

```
[☰ 列表] [≡ 时间线]   ← 两个 toggle 按钮
```

时间线为默认视图（`ViewMode = "timeline"`）。

### 4.2 时间分组

| 分组 | 时间范围 |
|------|----------|
| 今天 | 今日 00:00 ~ 现在 |
| 昨天 | 昨日 00:00 ~ 今日 00:00 |
| 本周更早 | 6 天前 ~ 昨日 00:00 |
| 更早 | 7 天前及更早 |

### 4.3 时间线视觉

```
  今天 ──────── (3) ──────────────────
  │                                    ← 左侧竖线 (border-l)
  │  ● Claude · fact                   ← 记忆条目
  │  2h ago  #rag #config             ← 元信息
  │
  │  ● GPT · conversation             ← 第二条
  │  1h ago
  │
```

## 5. 记忆条目

```
┌──────────────────────────────────────────────┐
│ □  ● Claude · fact                    ← checkbox, agent dot, type │
│    RAG pipeline config                  ← title (truncate)        │
│    RAG 管线使用 Top-K=5 检索...         ← content (truncate)     │
│    2h ago  #rag #config                ← relative time + tags     │
└──────────────────────────────────────────────┘
```

| 区域 | 样式 |
|------|------|
| Checkbox | 3×3px, rounded-sm, border-border / accent+white |
| Agent dot | 8px, rounded-full, agent.color or accent |
| Type badge | text-xs, text-tertiary |
| Title | font-medium, text-sm |
| Content | text-xs, text-secondary, truncate |
| Timestamp | text-[10px], text-tertiary, formatRelative |
| Tags | tag-chip, max 3 displayed |

### 条目点击

```
点击条目 → openFile(`/MemLab/memories/${agentName}/${memoryId}.md`)
```

## 6. 批量操作模式

选中一个或多个条目后：

```
已选择 3 项    [加标签] [🗑 删除] [取消]
```

### 批量操作交互

| 操作 | 行为 |
|------|------|
| 勾选 checkbox | 添加到 selected Set |
| 全选/取消 | (未来: 顶部 checkbox) |
| "加标签" | prompt "批量加标签 (逗号分隔)" → batchTag |
| "删除" | confirm → batchDelete |
| "取消" | clear selected |

## 7. 排序/过滤

```
  全部记忆 (42 条)          [☰ ▼] [↓ ▼]
                            ┌────────┐
                            │ 时间   │
                            │ 重要度 │
                            └────────┘
```

| 排序 | 依据 |
|------|------|
| 时间 | `updatedAt` 降序 (默认) |
| 重要度 | `importance` 降序 |

## 8. 空状态

```
┌──────────────────────────────────────┐
│                                       │
│          🕐                            │
│     尚未导入 Agent 记忆                │
│     连接 Agent 后即可管理其记忆         │
│                                       │
│    [导入 Agent 记忆]                   │
│                                       │
└──────────────────────────────────────┘
```

## 9. NewMemoryDialog

```
┌──────────────────────────────────────┐
│  新建记忆                          [×]│
├──────────────────────────────────────┤
│                                       │
│  Agent [Claude          ▼]            │
│  类型  [fact            ▼]            │
│  标题  [________________]              │
│                                       │
│  内容                                  │
│  ┌──────────────────────────────────┐ │
│  │                                  │ │
│  │  (textarea, 多行)                │ │
│  │                                  │ │
│  │                                  │ │
│  └──────────────────────────────────┘ │
│                                       │
│  标签  [tag1] [tag2] [+添加]          │
│                                       │
│           [取消]  [创建]              │
└──────────────────────────────────────┘
```

## 10. ImportWizardDialog

```
┌──────────────────────────────────────┐
│  导入 Agent 记忆                   [×]│
├──────────────────────────────────────┤
│  步骤 1/2: 选择源                     │
│                                       │
│  ○ Ollama 记忆                        │
│  ○ MemGPT 导出                        │
│  ○ 自定义格式                         │
│  ○ 目录监控                           │
│                                       │
│  [下一步 →]                           │
└──────────────────────────────────────┘
```

## 11. 状态矩阵

| 状态 | UI |
|------|-----|
| 无 Agent | "尚未导入 Agent 记忆" |
| 有 Agent 无记忆 | Agent 卡片显示 0 条 |
| 过滤后无结果 | "没有匹配的记忆" |
| 加载中 | listAgents / list loading (暂不处理 skeleton) |
| 批量标签成功 | toast "已更新标签" |
| 批量删除 | confirm → 删除 → 刷新列表 |
