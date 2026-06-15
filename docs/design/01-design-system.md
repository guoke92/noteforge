# NoteForge UI 设计规范 v1.0

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **本地优先** | 所有交互即时响应；网络仅用于 AI 调用，不应阻塞核心操作 |
| **内容即核心** | 编辑器占绝对视觉权重，导航和面板用减法设计 |
| **渐进式复杂** | 新手看到简洁首页，高级用户可调出完整 IDE 级面板体系 |
| **一致可预测** | 同一操作在不同上下文使用相同组件和快捷键 |

## 2. 色彩系统

### 2.1 品牌色

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-accent` | `#0969da` | `#58a6ff` | 主色：按钮、激活态、链接 |
| `--color-accent-hover` | `#0860ca` | `#79c0ff` | Hover 加深 |

### 2.2 语义色

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-success` | `#1a7f37` | `#3fb950` | 在线状态、保存成功 |
| `--color-warning` | `#9a6700` | `#d29922` | 离线状态、未索引 |
| `--color-danger` | `#cf222e` | `#f85149` | 删除、错误消息 |
| `--color-info` | `#0969da` | `#58a6ff` | 提示信息 |

### 2.3 中性色（背景）

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-bg-primary` | `#ffffff` | `#0d1117` | 主背景（编辑器） |
| `--color-bg-secondary` | `#f6f8fa` | `#161b22` | 面板背景 |
| `--color-bg-tertiary` | `#f0f2f5` | `#21262d` | Item hover / 代码块 |
| `--color-surface` | `#ffffff` | `#1c2128` | 卡片 / Dialog |

### 2.4 文字色

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-text-primary` | `#1f2328` | `#e6edf3` | 正文 |
| `--color-text-secondary` | `#656d76` | `#8b949e` | 辅助文字 |
| `--color-text-tertiary` | `#8b949e` | `#6e7681` | 占位符、禁用态 |
| `--color-text-link` | `#0969da` | `#58a6ff` | Wiki 链接、可点击文本 |

### 2.5 边框

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--color-border` | `#e1e4e8` | `#30363d` | 默认分割线 |
| `--color-border-focus` | `#0969da` | `#58a6ff` | Focus 态高亮 |

### 2.6 标签/标记色

| Token | Light | Dark |
|-------|-------|------|
| `--color-tag-bg` | `#ddf4ff` | `#1f3a5f` |
| `--color-tag-text` | `#0969da` | `#79c0ff` |
| `--color-diff-insert` | `#d2f4d4` | `#1b3c1f` |
| `--color-diff-delete` | `#ffd7d5` | `#3c1f1b` |

## 3. 字体与排版

### 3.1 字体栈

```css
--font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
--font-mono: "SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace;
--font-editor: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
```

### 3.2 字号层级

| Token | Size | 用途 |
|-------|------|------|
| `text-xs` | 11-12px | 标签、统计、时间戳 |
| `text-sm` | 13-14px | 面板文字、Dialog 内容 |
| `text-base` | 15-16px | Editor 正文字号 |
| `text-lg` | 18-20px | 弹窗标题、小标题 |
| `text-2xl` | 22-24px | 欢迎页标题 |

### 3.3 行高

| 上下文 | 行高 |
|--------|------|
| UI 文本 | 1.5 |
| Markdown 正文 | 1.7 |
| 代码块 | 1.4 |

## 4. 间距与圆角

| Token | Value | 用途 |
|-------|-------|------|
| `gap-1` | 4px | 紧凑 icon+label |
| `gap-2` | 8px | 组件间间距 |
| `gap-3` | 12px | 区块间距 |
| `gap-4` | 16px | 大间距 |
| `rounded-sm` | 3px | Button、Input |
| `rounded-md` | 6px | Panel、Dialog |
| `rounded-xl` | 12px | Dialog overlay |

## 5. 组件状态规范

### 5.1 Button

```
┌─────────────────┬──────────┬──────────┬──────────┬──────────┐
│ Variant         │ Default  │ Hover    │ Active   │ Disabled │
├─────────────────┼──────────┼──────────┼──────────┼──────────┤
│ primary         │ bg-text  │ bg+hover │ pressed  │ opacity  │
│                 │ white    │ darker   │ inset    │ 50%      │
├─────────────────┼──────────┼──────────┼──────────┼──────────┤
│ ghost           │ bg-trans │ bg-tert  │ bg-tert  │ opacity  │
│                 │ text-pr  │ text-pr  │ text-pr  │ 50%      │
├─────────────────┼──────────┼──────────┼──────────┼──────────┤
│ outline         │ border   │ bg-tert  │ bg-tert  │ opacity  │
│                 │ bg-trans │          │          │ 50%      │
├─────────────────┼──────────┼──────────┼──────────┼──────────┤
│ danger          │ text-dgr │ bg-tert  │ bg-tert  │ opacity  │
│                 │          │          │          │ 50%      │
└─────────────────┴──────────┴──────────┴──────────┴──────────┘

尺寸: sm(28px), md(32px), icon(28px)
```

### 5.2 Input / Search

```
States: Default | Focus | Hover | Disabled | Error

Default: border 1px solid --color-border
Focus:   border 1px solid --color-border-focus, ring 2px accent/30
Hover:   border 1px solid --color-text-tertiary
Disabled: opacity 50%, cursor not-allowed
Error:   border 1px solid --color-danger

Placeholder: --color-text-tertiary
```

### 5.3 Card

```
Default:  bg-surface, border 1px border, rounded-md
Hover:    border-color -> accent (action card)
Selected: border-color -> accent, bg-bg-tertiary (agent card)
```

### 5.4 Tree Node

```
Default:  padding-left cascading by depth, rounded-sm
Hover:    bg-bg-tertiary
Dragging: (TBD — not yet implemented)
Context menu action: via Dropdown (right-click future)
```

### 5.5 Dropdown

```
Trigger:  inline button, no special style
Panel:    bg-surface, border 1px, shadow-md (--shadow-md)
          8px padding, min-width 160px
Item:     px-2 py-1.5, text-sm, hover:bg-bg-tertiary
Separator: h-px my-1 bg-border
Danger item: text-danger
```

### 5.6 Dialog (Modal)

```
Overlay:   rgba(0,0,0,0.4), fixed inset-0, z-40
Content:   bg-surface, border, rounded-xl, shadow-lg
SM: max-w-md (440px)   — 确认框
MD: max-w-lg (560px)   — 新建记忆
LG: max-w-2xl (700px)  — 设置、搜索
XL: max-w-4xl (960px)  — 导入向导
```

### 5.7 Tag Chip

```
Default:  bg-tag-bg, text-tag-text, rounded-sm, px-1.5 py-0.5
Active:   bg-accent, text-white
```

### 5.8 Status Dot

```
Online:   bg-success (green)
Warning:  bg-warning (yellow)
Offline:  bg-danger (red)
Size:     8px, rounded-full
```

## 6. 布局架构

```
┌────────────────────────────────────────────────────────────┐
│  TopBar (40px)                                            │
│  ┌─────────┬──────────────┬─────────┬─────────────────┐    │
│  │  ☰ M    │ 知识库: xxx  │ 菜单  │  🔍  Save  🌙  □  │   │
│  └─────────┴──────────────┴─────────┴─────────────────┘    │
├──────┬──────────────────────────────┬──────────────────────┤
│      │                              │                      │
│ Side │     Editor Area              │   Right Panel        │
│ bar  │   (分屏支持)                 │   (backlinks/        │
│ 260px│                              │    outline/graph/    │
│      │   TabBar                     │    AI)               │
│ icons│                              │   280-320px          │
│ +    ├──────────────────────────────┤                      │
│ pane │                              │                      │
│      │   Monaco / Markdown          │                      │
│      │   Preview / JSON Tree        │                      │
│      │                              │                      │
├──────┴──────────────────────────────┴──────────────────────┤
│  StatusBar (24px) — 模型状态 / LSP / 光标行列 / 编码       │
└────────────────────────────────────────────────────────────┘
```

### 6.1 可折叠面板

| 面板 | 宽度 | 快捷键 |
|------|------|--------|
| Sidebar | 260px (可调 200-500) | `Cmd+B` |
| Right Panel | 300px (可调 220-500) | 图标切换 |
| Problem Panel | 底部高度自适应 | `Cmd+⇧M` |

### 6.2 分屏机制

- 拖动 Tab 到右侧触发 `splitRight()`，创建新 pane
- 每个 pane 独立 TabBar / Tab 集
- 最多支持 3 列分屏
- 关闭最后一个 Tab 显示 WelcomeView + "关闭分屏"按钮

## 7. 交互规范

### 7.1 全局快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd+N` | 新建空白文件 |
| `Cmd+S` | 保存当前文件 |
| `Cmd+P` | 全局搜索 (文件名) |
| `Cmd+⇧F` | 全局搜索 (全文) |
| `Cmd+⇧E` | AI 精炼选中文本 |
| `Cmd+B` | 切换侧边栏 |
| `Cmd+\` | 向右分屏 |
| `Cmd+W` | 关闭当前 Tab |
| `Cmd+⇧M` | 切换 Problem 面板 |
| `Cmd+,` | 打开设置 |

### 7.2 右键菜单

所有文件树节点支持右键菜单：新建文件/文件夹、重命名、复制路径、删除、刷新。

### 7.3 拖拽

- Tab 可以拖拽到另一个 pane 合并
- (未来) 文件树支持拖拽移动文件
- (未来) 标签拖拽到文件上关联

### 7.4 响应式

- Desktop-first (Tauri 窗口)
- 最小窗口: 800×500
- 窗口 < 900px 时右侧面板自动折叠
- 窗口 < 640px 时侧边栏切换为抽屉模式

## 8. 动画

| 场景 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| Panel 展开/折叠 | width | 150ms | ease |
| Dialog 出现 | opacity + scale | 200ms | ease-out |
| Hover 态 | background-color | 100ms | ease |
| 图表节点 | transform | 30ms | linear (sim tick) |

## 9. 暗色模式

- 遵循系统偏好 (prefers-color-scheme)，提供手动切换
- 所有 CSS 变量自动适配
- 代码语法高亮同步切换 (Monaco theme)
