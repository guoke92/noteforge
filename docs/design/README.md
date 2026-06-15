# NoteForge UI/UX 设计稿

## 目录

| # | 文件 | 内容 |
|---|------|------|
| 1 | `01-design-system.md` | 设计规范：色彩、字体、组件状态、交互原则、布局架构 |
| 2 | `02-workspace.md` | Workspace 管理：Onboarding 引导、WelcomeView、Workspace 切换 |
| 3 | `03-file-browser-editor.md` | 文件浏览与编辑：文件树、TabBar、Markdown 编辑/预览/分屏、StatusBar |
| 4 | `04-search.md` | 搜索：GlobalSearchDialog、标签云、搜索结果高亮 |
| 5 | `05-knowledge-graph.md` | 知识图谱：力导向布局、节点/边类型、选中态高亮、缩放筛选 |
| 6 | `06-ai-qa.md` | AI 问答：文本精炼、差异对比、QA 模式设计（未来）、来源引用 |
| 7 | `07-agent-memory.md` | Agent 内存管理：时间线视图、批量操作、导入向导 |
| 8 | `08-settings.md` | 系统设置：外观主题、AI 模型配置、连接测试 |

## 设计原则

1. **本地优先** — 所有交互即时响应，不依赖网络
2. **内容即核心** — 编辑器占绝对视觉权重
3. **渐进式复杂** — 简约首页 → 完整 IDE 级面板体系
4. **一致可预测** — 同一组件在不同页面行为一致

## 框架约定

- 前端：React + TypeScript + Tailwind + Radix UI
- 编辑器：Monaco Editor
- 状态管理：Zustand
- 图标：lucide-react
