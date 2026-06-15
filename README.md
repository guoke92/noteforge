# NoteForge

本地优先、编辑器与知识库深度融合、内置 AI 协作者的技术知识工作站。

## 技术栈

| 层次 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 |
| 前端框架 | React 18 + TypeScript |
| 编辑器内核 | Monaco Editor |
| 状态管理 | Zustand |
| UI | Radix UI + Tailwind CSS |
| 后端 | Rust |
| 全文搜索 | SQLite FTS5 + jieba-rs |
| 数据库 | SQLite (rusqlite) |
| 向量存储 | fastembed + JSON |
| 文件监视 | notify |
| 本地 AI | Ollama (HTTP API) |
| 加密 | ring + aes-gcm |
| 包管理 | pnpm (前端) + Cargo (Rust) |
| 构建 | Vite + tauri-cli |

## 前置要求

- Node.js >= 18
  - pnpm: `npm install -g pnpm`
  - Rust toolchain: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  - Tauri CLI: `cargo install tauri-cli --version "^2"`
  - (可选) Ollama: `curl -fsSL https://ollama.com/install.sh | sh`

## 快速开始

```bash
# 安装前端依赖
pnpm install

# 以开发模式运行（前端 + 后端）
pnpm tauri:dev
```

## 编译与构建

```bash
# 开发模式（热更新）
pnpm tauri:dev

# 生产构建
pnpm tauri:build

# 仅构建前端（不打包）
pnpm build

# 仅启动前端开发服务器（不启动 Tauri）
pnpm dev

# 预览构建产物
pnpm preview
```

## Rust 后端命令

> Cargo.toml 位于 `src-tauri/` 目录下，Rust 相关命令需在此目录下执行，或使用 `--manifest-path` 指定路径。

```bash
# 方式一：进入 src-tauri 目录执行（推荐）
cd src-tauri && cargo build
cd src-tauri && cargo test

# 方式二：从项目根目录通过 --manifest-path 执行
cargo build --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## 项目结构

```
noteforge/
├── src/                          # 前端源码 (React)
│   ├── components/               # UI 组件
│   ├── features/                 # 功能模块
│   ├── hooks/                    # 自定义 Hooks
│   ├── ipc/                      # Tauri IPC 调用封装
│   ├── store/                    # Zustand 状态管理
│   ├── lib/                      # 工具库
│   ├── App.tsx                   # 应用入口
│   └── main.tsx                  # React 挂载点
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── commands/             # Tauri IPC 命令（49个）
│   │   ├── ai.rs                 # Ollama AI 桥接
│   │   ├── config.rs             # 配置管理
│   │   ├── db.rs                 # SQLite 数据库
│   │   ├── encryption.rs         # AES-GCM 加密
│   │   ├── error.rs              # 错误类型
│   │   ├── knowledge.rs          # 知识图谱
│   │   ├── vector.rs             # 向量搜索
│   │   ├── watcher.rs            # 文件监视
│   │   ├── lib.rs                # 库入口
│   │   └── main.rs               # 二进制入口
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Tauri 配置
│   └── tests/                    # 集成测试
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── .eslintrc.json
├── .prettierrc.json
└── TECHNICAL_VERIFICATION.md     # 技术验证报告
```

## 可用 PNPM 脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动 Vite 前端开发服务器 |
| `pnpm build` | TypeScript 检查 + Vite 构建 |
| `pnpm preview` | 预览构建产物 |
| `pnpm lint` | ESLint 检查 |
| `pnpm format` | Prettier 格式化 |
| `pnpm tauri:dev` | 启动 Tauri 开发模式（前端 + 后端） |
| `pnpm tauri:build` | 生产构建并打包 |

## 环境要求

- **macOS**: 11.0+ (Big Sur)
  - **Windows**: 10 1809+ / Windows 11
  - **Linux**: WebKitGTK 4.1+ (Ubuntu 22.04+, Fedora 38+, Arch)

## 附加说明

- 全文搜索使用 SQLite FTS5 + unicode61 tokenizer，中文查询时配合 jieba-rs 分词
  - 向量搜索降级为 JSON 存储 + 内存余弦相似度计算（待 sqlite-vec 构建问题解决后切换）
  - 所有用户 API Key 使用 AES-GCM 加密存储
  - 技术验证详情见 `TECHNICAL_VERIFICATION.md`
