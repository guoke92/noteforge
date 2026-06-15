# AGENTS.md — NoteForge

Tauri v2 desktop app: React 18 + TypeScript frontend, Rust backend. Local-first knowledge management with AI integration. Originally named "MemWork", renamed to "NoteForge" in 2026.

## Commands

```bash
# Dev (frontend only, no Tauri)
pnpm dev

# Dev (full app: frontend + Rust backend)
pnpm tauri:dev

# Build (runs tsc --noEmit then vite build)
pnpm build

# Lint (zero warnings enforced)
pnpm lint

# Format
pnpm format

# Rust backend (run from src-tauri/ or use --manifest-path)
cd src-tauri && cargo build
cd src-tauri && cargo test
```

## Architecture

- **Frontend**: `src/` — React, Zustand stores, Radix UI + Tailwind. Entry: `src/main.tsx` → `src/App.tsx`
- **Backend**: `src-tauri/src/` — Rust. Entry: `main.rs` → `lib.rs`. Commands in `commands/` dir (13 command modules)
- **IPC bridge**: `src/ipc/index.ts` — single entry for all backend calls. Falls back to mock stubs (`src/ipc/stub.ts`) when not in Tauri (browser dev)
- **Stores**: `src/store/` — Zustand. `editor.ts`, `ui.ts`, `workspace.ts`, `theme.ts`, `ai.ts`, `startup.ts`
- **Core services**: `src/core/` — Document service, dialog API, session management, runtime bridge
- **Editor**: Monaco (`src/components/editor/MonacoEditor.tsx`) + Milkdown (`src/features/markdown/MarkdownPanel.tsx`) for markdown
- **State flow**: Stores → IPC → Tauri commands → Rust (SQLite, filesystem, Ollama)

## Key Conventions

- Path alias: `@/` → `src/` (configured in tsconfig + vite)
- ESLint: `no-explicit-any` off, unused vars warn with `_` prefix ignore pattern
- Prettier: double quotes, semicolons, trailing commas, 100 printWidth, LF line endings
- Tailwind: custom color tokens via CSS vars (e.g. `bg-bg-primary`, `text-text-secondary`), custom spacing in 4px increments
- Dark mode: class-based (`darkMode: ["class"]`)
- Vite dev server runs on `localhost:1420` (strictPort)

## Domain Model

- **Workspace**: Root directory with config, supports file tree, FTS5 search, knowledge graph
- **Document**: Content unit with lifecycle: `ephemeral` → `persisted` → `conflict` | `deleted-externally`
- **Scratch**: Temporary untitled files persisted in `{app_data_dir}/scratch/` (not in workspace)
- **Editor Tab**: Has `kind: "scratch" | "workspace"`, `scratchId` for persistence, `baseline` for dirty detection
- **Knowledge Engine**: `IndexPipeline` — 6-step atomic index (notes → FTS → embeddings → tags → links → graph)

## Gotchas

- `pnpm build` runs `tsc --noEmit` before Vite — TypeScript errors block the build
- `pnpm lint` enforces `--max-warnings 0` — any warning fails lint
- Rust Cargo.toml is in `src-tauri/`, not project root — use `--manifest-path` from root or `cd src-tauri`
- IPC layer auto-adapts: real Tauri invoke in desktop, stub/mock in browser — new backend commands need a stub counterpart for browser dev
- Tauri v2 API (`@tauri-apps/api` v2) — not v1 patterns
- Monaco editor is chunked separately in Vite config (`manualChunks`)
- Frontend env vars must be prefixed `VITE_` or `TAURI_`
- Virtual paths (`untitled://`) are rejected by file commands via `ensure_real_file_path()` guard
- After project rename from `memwork-backend`: clean `src-tauri/target/` if build references stale crate name

## Testing

- Frontend: no test framework configured (no test script in package.json)
- Rust: `cargo test` in `src-tauri/` — 18+ contract tests validating IPC boundaries
- Design docs in `.tmp/`: refactor plan, requirements spec, system architecture (reference only, not executable)
