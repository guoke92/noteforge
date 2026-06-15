# 文件浏览与编辑 — 交互原型 & 高保真

## 1. 布局架构

```
┌───────────────────────────────────────────────────────────────────┐
│ TopBar                                                            │
├─────────┬───────────────────────────────────┬─────────────────────┤
│ Sidebar │  TabBar ┌─────┬─────┬────┐   ×   │ RightPanel          │
│ (260px) │         │note1│note2│ + │        │ [backlinks/outline/ │
│         ├───────────────────────────────────┤  graph/AI]          │
│ ┌─────┐ │  Editor (Monaco/Preview/JSON)     │                     │
│ │ 📁  │ │                                   │  ┌─────────────────┐│
│ │ ☰   │ │   # 标题                          │  │ 📎 Backlinks    ││
│ │ 📂  │ │                                   │  │ ├─[[ref1]]      ││
│ │  📄 │ │   正文内容                         │  │ ├─[[ref2]]      ││
│ │     │ │                                   │  │ └─[[ref3]]      ││
│ │     │ │                                   │  └─────────────────┘│
│ │ ☰   │ │  (Markdown 编辑/预览/分屏)         │                     │
│ └─────┘ │                                   │                     │
├─────────┴───────────────────────────────────┴─────────────────────┤
│ StatusBar                                                         │
└───────────────────────────────────────────────────────────────────┘
```

## 2. 文件树交互

```
─ Knowledge Base                [📄+  📁+]
  ├── notebooks/
  │   ├── agent-api.md          ⇽ 点击 → open in editor
  │   ├── knowledge-base.md
  │   └── architecture.md
  ├── journals/
  │   └── 2026-06-02.md
  ├── assets/
  └── noteforge.json
```

### 节点状态

```
Folder collapsed:   📁  (ChevronRight 12px, --color-warning)
Folder expanded:    📂  (ChevronDown 12px, --color-warning)
Markdown file:      📄  (FileText 14px, --color-text-link)
JSON file:          { }  (font-mono xs)
YAML file:          ⚙
Other file:         📄  (FileIcon 14px)
```

### 交互细节

| 操作 | 行为 |
|------|------|
| 单击文件夹 | toggleDir → 展开/收起子节点 |
| 单击文件 | openFile → 在 editor 中打开 |
| 双击任何节点 | 同上 |
| 右键 > 新建文件 | prompt 文件名 → createFile → 打开 |
| 右键 > 新建文件夹 | prompt 文件夹名 → createDir |
| 右键 > 重命名 | 节点变为 inline input |
| 右键 > 删除 | confirm → deleteEntry |
| 右键 > 复制路径 | clipboard |
| 鼠标悬停 | bg-bg-tertiary, 右侧 `⋮` 按钮显示 |
| 长文件名称 | truncate with ellipsis |

### Rename Inline

```
─ notebooks/
  │  agent-api.md
  │  [knowledge-base.md   ]       ⇽ input autoFocus, border-focus
  │  architecture.md
```

按 Enter 提交，按 Escape 取消。

## 3. TabBar

```
┌──────────────────────────────────────────────────┐
│ 📄 agent-api.md ✕  │ 📄 notes.md ● ✕  │  +    │
│                     │ (dirty indicator)   │      │
│   Active tab        │                      │      │
│   (accent bottom    │                      │      │
│    border 2px)      │                      │      │
└──────────────────────────────────────────────────┘
```

### 状态

| 状态 | 表现 |
|------|------|
| Active | 底部 accent 2px 色条，字体 semibold |
| Inactive | 灰色，底部透明 |
| Dirty (未保存) | Tab 标题前 ● 红点 |
| Hover | bg-bg-tertiary |
| Close button ✕ | hover 时显示，或始终可见 |
| 新 tab | 点击 `+` → newUntitled() |

## 4. Markdown 编辑区

### 4.1 三种预览模式

通过 `cyclePreviewMode()` 切换：

| 模式 | 快捷键 | 布局 |
|------|--------|------|
| Edit | `Cmd+⇧P` cycle | 纯 Monaco 编辑器 |
| Preview | `Cmd+⇧P` cycle | 纯 Markdown 渲染 |
| Split | `Cmd+⇧P` cycle | 左编辑右预览，1:1 |

### 4.2 Split 视图

```
┌──────────────────────┬─────────────────────────────┐
│   Monaco Editor      │   Markdown Preview            │
│   (Monaco)           │   (Custom renderer)           │
│                      │                               │
│   # Title            │   # Title                     │
│                      │                               │
│   正文内容            │   正文内容                     │
│   [[双链]]           │   🔗 双链(clickable link)      │
│   #tag               │   #tag (tag-chip)             │
│                      │                               │
│   Ln 5, Col 20       │                               │
└──────────────────────┴─────────────────────────────┘
```

### 4.3 AI 浮动工具栏

选中文本后弹出：

```
┌──────────────────────────────────┐
│ ✨ 精炼  📋 摘要  🌐 翻译  🎨 改写  │
└──────────────────────────────────┘
```

Position: 浮动在选区上方
如果 AI Panel 关闭，点击触发 setRightMode("ai")

## 5. StatusBar

```
在线 (Ollama)  │  Ln 5  Col 20  │  UTF-8  │  Markdown  │  📁 MemLab
```

### 状态

| 区块 | 来源 | 说明 |
|------|------|------|
| AI 模型状态 | useAIStore.status | 绿dot=在线/黄dot=无模型/红dot=离线 |
| 光标位置 | Monaco API | Ln/Col |
| 编码 | Monaco API | UTF-8 等 |
| 语言 | current tab language | 自动检测或手动设置 |
| 工作空间 | workspace.name | 当前 workspace |

## 6. 编辑状态

| 场景 | UI 表现 |
|------|---------|
| 文件加载中 | Monaco 显示加载动画 |
| 文件保存 | 状态栏短暂显示 "已保存"，dirty dot 消失 |
| 文件保存失败 | 状态栏红字 "保存失败: 原因" |
| 外部文件变更 | ensureFreshFromDisk 检测 → 提示 "文件已更新，重新加载？" |
| 未保存关闭 | Tab close 触发 confirm "有未保存的更改，是否保存？" |
