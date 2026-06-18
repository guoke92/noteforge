// =====================================================================
//  In-memory IPC stub — drives the UI when the Rust backend is absent.
//  Behaviour is deliberately deterministic so we can self-test the UI.
//
//  Real Tauri commands replace these one-for-one; the function shapes
//  are kept identical to the architecture document.
// =====================================================================

import type {
  AIRefineResult,
  AISuggestedLink,
  Agent,
  AppConfigBackend,
  BacklinkBackend,
  CreateWorkspaceResult,
  FileBackendEntry,
  FileInfo,
  GraphEdgeBackend,
  GraphNodeBackend,
  KnowledgeGraphBackend,
  LanguageDetection,
  LinkBackend,
  MemoryBackendEntry,
  MemoryType,
  ModelInfo,
  OpenWorkspaceResult,
  SearchBackendResult,
  TagCount,
  WorkspaceConfig,
  ScratchBufferPayload,
  ScratchSessionPayload,
  ScratchRestoreResponse,
  WorkspaceDraftPayload,
} from "@/types";

/* ---------- Demo workspace seed ------------------------------------ */

const ROOT_PATH = "/MemLab";

const initialFiles: Record<string, string> = {
  [`${ROOT_PATH}/notebooks/agent-api.md`]: `---
title: Agent API 设计
date: 2026-06-01
tags: [ai, agent, design]
status: draft
---

# Agent API 设计

这是关于 [[knowledge-base]] 和 [[Agent]] 的 API 设计说明。

## 概述

NoteForge 通过 Tauri commands 提供前后端通讯，所有 \`#ai\` 相关操作都通过统一的 AI 服务模块。

\`\`\`python
def hello_agent():
    print("hi")
\`\`\`

> 当前实现已通过 [[project-note]] 的初步验证。

参考 [[markdown-guide]] 了解 Markdown 增强能力。

## 标签

#ai #agent #design
`,
  [`${ROOT_PATH}/notebooks/project-note.md`]: `---
title: 项目纪要
date: 2026-05-28
tags: [project, design]
---

# 项目纪要

围绕 [[agent-api]] 的对话记录与设计草案。

- 第一阶段: 完成 [[knowledge-base]] 的基础检索
- 第二阶段: 接入 [[Agent]] 记忆同步
- 第三阶段: AI 协作能力

#project #design
`,
  [`${ROOT_PATH}/notebooks/knowledge-base.md`]: `# 知识库

本仓库是 NoteForge 的演示知识库 (MemLab)。请参考 [[agent-api]] 与 [[project-note]]。

#知识管理 #笔记
`,
  [`${ROOT_PATH}/notebooks/markdown-guide.md`]: `# Markdown 指南

支持 GFM 表格、任务列表、代码块、双链 \`[[文件名]]\`、标签 \`#tag\`、YAML Front Matter。

| 功能 | 状态 |
|------|------|
| 实时预览 | ✓ |
| 双链跳转 | ✓ |
| 反向链接 | ✓ |

- [x] 编辑 & 预览
- [ ] 分屏同步滚动
- [ ] 代码块语法高亮

#笔记 #指南
`,
  [`${ROOT_PATH}/configs/server.yaml`]: `server:
  host: localhost
  port: 8080
  logging:
    level: info
    file: /var/log/noteforge.log
database:
  host: db.local
  port: 5432
`,
  [`${ROOT_PATH}/configs/schema.json`]: `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NoteForge Workspace Config",
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "path": { "type": "string" },
    "indexing": {
      "type": "object",
      "properties": {
        "ignore": { "type": "array", "items": { "type": "string" } }
      }
    }
  },
  "required": ["name", "path"]
}
`,
  [`${ROOT_PATH}/memories/ollama/2026-06-01-api-discussion.md`]:
    `# API 设计讨论\n\nAgent: Ollama\n时间: 2026-06-01 14:23\n\n讨论了 [[agent-api]] 的接口形态，确认采用 Tauri commands。\n\n#ai #agent`,
  [`${ROOT_PATH}/memories/ollama/2026-06-01-create-project-note.md`]:
    `# 创建 project-note.md\n\nAgent: Ollama\n时间: 2026-06-01 09:00\n\n根据用户指令创建了 [[project-note]]。`,
  [`${ROOT_PATH}/memories/memgpt/2026-06-01-config-update.md`]:
    `# 配置更新 server.yaml\n\nAgent: MemGPT\n时间: 2026-06-01 12:10\n\n更新了 logging.level 为 info。`,
  [`${ROOT_PATH}/memories/memgpt/2026-05-31-knowledge-base.md`]:
    `# 读取 knowledge-base.md\n\nAgent: MemGPT\n时间: 2026-05-31 20:30\n\n按用户请求加载并解析了 [[knowledge-base]]。`,
};

const fileStore = new Map<string, string>(Object.entries(initialFiles));

/* ---------- Helpers ------------------------------------------------ */

function uuid(): string {
  return "id-" + Math.random().toString(36).slice(2, 11);
}

function _dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

function basename(path: string): string {
  return path.split("/").pop() || "";
}

function extLang(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return (
    {
      md: "markdown",
      markdown: "markdown",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      rs: "rust",
      go: "go",
      java: "java",
      c: "cpp",
      cpp: "cpp",
      h: "cpp",
      html: "html",
      htm: "html",
      css: "css",
      sh: "shell",
      bash: "shell",
      sql: "sql",
      xml: "xml",
      toml: "toml",
    }[ext] || "plaintext"
  );
}

const sleep = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms));

/* ============================================================
 *  Workspace
 * ============================================================ */

const workspaces: WorkspaceConfig[] = [
  {
    id: "ws-memlab",
    name: "MemLab",
    path: ROOT_PATH,
    createdAt: "2026-05-20T10:00:00+08:00",
    updatedAt: "2026-06-01T10:00:00+08:00",
  },
];

// Internal workspace store (backend-aligned shape with config)
const backendWorkspaces: OpenWorkspaceResult[] = [
  {
    id: "ws-memlab",
    config: {
      name: "MemLab",
      path: ROOT_PATH,
      auto_index: true,
      exclude_patterns: [".git", "node_modules"],
    },
  },
];

export async function listWorkspaces(): Promise<WorkspaceConfig[]> {
  await sleep();
  return workspaces;
}

export async function createWorkspace(name: string, path: string): Promise<CreateWorkspaceResult> {
  await sleep();
  const id = uuid();
  const ws: OpenWorkspaceResult = {
    id,
    config: {
      name,
      path,
      auto_index: true,
      exclude_patterns: [".git", "node_modules"],
    },
  };
  backendWorkspaces.push(ws);
  return { id, path };
}

export async function openWorkspace(path: string): Promise<OpenWorkspaceResult> {
  await sleep();
  const existing = backendWorkspaces.find((w) => w.config.path === path);
  if (existing) return existing;
  const id = uuid();
  const name = basename(path) || "Untitled";
  const result: OpenWorkspaceResult = {
    id,
    config: {
      name,
      path,
      auto_index: true,
      exclude_patterns: [".git", "node_modules"],
    },
  };
  backendWorkspaces.push(result);
  return result;
}

export async function getWorkspaceConfig(id: string): Promise<WorkspaceConfig> {
  await sleep();
  const ws = workspaces.find((w) => w.id === id);
  if (!ws) throw new Error("WORKSPACE_NOT_FOUND");
  return ws;
}

export async function updateWorkspaceConfig(
  id: string,
  config: Partial<WorkspaceConfig>,
): Promise<void> {
  await sleep();
  const idx = workspaces.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error("WORKSPACE_NOT_FOUND");
  workspaces[idx] = { ...workspaces[idx], ...config, updatedAt: new Date().toISOString() };
}

/* ============================================================
 *  File system
 * ============================================================ */

export async function readFile(path: string): Promise<{ content: string; language: string }> {
  await sleep(20);
  if (path.includes("://") || path.startsWith("untitled:")) {
    throw new Error("INVALID_PATH: virtual documents cannot be read as files");
  }
  if (!fileStore.has(path)) throw new Error("FILE_NOT_FOUND: " + path);
  return { content: fileStore.get(path)!, language: extLang(basename(path)) };
}

export async function writeFile(path: string, content: string): Promise<void> {
  await sleep(20);
  if (path.includes("://") || path.startsWith("untitled:")) {
    throw new Error("INVALID_PATH: virtual documents cannot be written as files");
  }
  fileStore.set(path, content);
}

export async function listDirectory(path: string): Promise<FileBackendEntry[]> {
  await sleep(20);
  const target = path === "/" ? "" : path.replace(/\/$/, "");
  const direct = new Map<string, FileBackendEntry>();

  for (const filePath of fileStore.keys()) {
    if (!filePath.startsWith(target + "/")) continue;
    const rest = filePath.slice(target.length + 1);
    const seg = rest.split("/")[0];
    const full = target + "/" + seg;
    const isDir = rest.includes("/");
    if (direct.has(full)) continue;
    direct.set(full, {
      path: full,
      name: seg,
      is_dir: isDir,
      size: 0,
      modified: new Date().toISOString(),
    });
  }

  return Array.from(direct.values()).sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function createFile(path: string, content = ""): Promise<void> {
  await sleep(20);
  if (fileStore.has(path)) throw new Error("CREATE_ERROR: file already exists");
  fileStore.set(path, content);
}

export async function deleteFile(path: string): Promise<void> {
  await sleep(20);
  if (!fileStore.has(path)) {
    // Maybe a directory — remove all matching prefixes
    let removed = 0;
    for (const k of Array.from(fileStore.keys())) {
      if (k.startsWith(path + "/")) {
        fileStore.delete(k);
        removed++;
      }
    }
    if (!removed) throw new Error("FILE_NOT_FOUND");
    return;
  }
  fileStore.delete(path);
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  await sleep(20);
  if (!fileStore.has(oldPath)) throw new Error("FILE_NOT_FOUND");
  fileStore.set(newPath, fileStore.get(oldPath)!);
  fileStore.delete(oldPath);
}

export async function moveFile(source: string, destination: string): Promise<void> {
  await renameFile(source, destination);
}

export async function getFileInfo(path: string): Promise<FileInfo> {
  await sleep(20);
  if (!fileStore.has(path)) throw new Error("FILE_NOT_FOUND");
  const content = fileStore.get(path)!;
  return {
    size: new TextEncoder().encode(content).length,
    modified: new Date().toISOString(),
    language: extLang(basename(path)),
    isDir: false,
  };
}

export async function fileStat(
  path: string,
): Promise<{ size: number; mtime: string; lineCountEstimate: number }> {
  await sleep(20);
  if (!fileStore.has(path)) throw new Error("FILE_NOT_FOUND");
  const content = fileStore.get(path)!;
  const size = new TextEncoder().encode(content).length;
  const lineCountEstimate = (content.match(/\n/g)?.length ?? 0) + 1;
  return { size, mtime: new Date().toISOString(), lineCountEstimate };
}

export async function readFileRange(
  path: string,
  offset: number,
  length: number,
): Promise<{ content: string; totalSize: number; truncated: boolean }> {
  await sleep(20);
  if (!fileStore.has(path)) throw new Error("FILE_NOT_FOUND");
  const full = fileStore.get(path)!;
  const totalSize = new TextEncoder().encode(full).length;
  const content = full.slice(offset, offset + length);
  return { content, totalSize, truncated: offset + length < totalSize };
}

/* ============================================================
 *  Editor
 * ============================================================ */

export async function detectLanguage(content: string, filename?: string): Promise<LanguageDetection> {
  await sleep(10);
  if (filename) {
    const lang = extLang(filename);
    return { language: lang, confidence: lang === "plaintext" ? 0.4 : 0.95 };
  }
  // Tiny content sniffing
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return { language: "json", confidence: 0.7 };
  if (trimmed.startsWith("---") || /^[a-zA-Z_][\w-]*:\s/.test(trimmed))
    return { language: "yaml", confidence: 0.6 };
  if (trimmed.startsWith("#")) return { language: "markdown", confidence: 0.5 };
  return { language: "plaintext", confidence: 0.3 };
}

export async function formatCode(content: string, language: string): Promise<{ formatted: string }> {
  await sleep(40);
  try {
    if (language === "json") {
      return { formatted: JSON.stringify(JSON.parse(content), null, 2) + "\n" };
    }
    // For other languages, return as-is (real backend uses native formatters)
    return { formatted: content };
  } catch {
    throw new Error("FORMAT_ERROR");
  }
}

/* ============================================================
 *  Knowledge engine
 * ============================================================ */

const WIKI_RE = /\[\[([^[\]]+?)\]\]/g;
const TAG_RE = /(^|\s)#([\w\u4e00-\u9fa5-]+)/g;

function noteName(path: string): string {
  return basename(path).replace(/\.[^.]+$/, "");
}

export async function extractLinks(content: string, filePath: string): Promise<LinkBackend[]> {
  await sleep(5);
  const out: LinkBackend[] = [];
  const allNotes = Array.from(fileStore.keys()).filter((p) => p.endsWith(".md"));
  const titles = new Map(allNotes.map((p) => [noteName(p), p]));
  for (const m of content.matchAll(WIKI_RE)) {
    const target = m[1].trim();
    const resolvedPath = titles.get(target);
    out.push({
      id: uuid(),
      source_file: filePath,
      target_file: resolvedPath || target,
      link_type: "reference",
      context: resolvedPath ? null : null,
    });
  }
  return out;
}

export async function extractTags(content: string): Promise<string[]> {
  await sleep(5);
  const out = new Set<string>();
  for (const m of content.matchAll(TAG_RE)) out.add(m[2]);
  // also pull from YAML front matter `tags: [a, b]`
  const fm = content.match(/^---\s*([\s\S]*?)\s*---/);
  if (fm) {
    const tagsLine = fm[1].match(/tags:\s*\[([^\]]*)\]/);
    if (tagsLine) {
      tagsLine[1]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((t) => out.add(t));
    }
  }
  return Array.from(out);
}

export async function getBacklinks(filePath: string): Promise<BacklinkBackend[]> {
  await sleep(15);
  const target = noteName(filePath);
  const result: BacklinkBackend[] = [];
  for (const [path, content] of fileStore.entries()) {
    if (path === filePath || !path.endsWith(".md")) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(`[[${target}]]`)) {
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length, i + 2);
        result.push({
          source_file: path,
          context: lines.slice(start, end).join(" ").trim().slice(0, 120),
        });
        break;
      }
    }
  }
  return result;
}

export async function getTags(_workspaceId: string): Promise<TagCount[]> {
  await sleep();
  const counts = new Map<string, number>();
  for (const [path, content] of fileStore.entries()) {
    if (!path.endsWith(".md")) continue;
    const tags = await extractTags(content);
    tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export async function filterByTags(_workspaceId: string, tags: string[]): Promise<FileBackendEntry[]> {
  await sleep();
  if (!tags.length) return [];
  const result: FileBackendEntry[] = [];
  for (const [path, content] of fileStore.entries()) {
    if (!path.endsWith(".md")) continue;
    const fileTags = await extractTags(content);
    if (tags.every((t) => fileTags.includes(t))) {
      result.push({
        path,
        name: basename(path),
        is_dir: false,
        size: 0,
        modified: new Date().toISOString(),
      });
    }
  }
  return result;
}

export async function searchFulltext(
  _workspaceId: string,
  query: string,
  limit = 30,
): Promise<SearchBackendResult[]> {
  await sleep(40);
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: SearchBackendResult[] = [];
  for (const [path, content] of fileStore.entries()) {
    const idx = content.toLowerCase().indexOf(q);
    const nameMatch = basename(path).toLowerCase().includes(q);
    if (idx === -1 && !nameMatch) continue;
    const start = Math.max(0, idx - 40);
    const snippet =
      idx === -1
        ? content.slice(0, 120)
        : content.slice(start, Math.min(content.length, idx + q.length + 80));
    results.push({
      file_path: path,
      title: noteName(path),
      content: snippet.replace(/\n/g, " "),
      score: nameMatch ? 2 : 1,
    });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function semanticSearch(
  workspaceId: string,
  query: string,
  limit = 30,
): Promise<SearchBackendResult[]> {
  const ft = await searchFulltext(workspaceId, query, limit);
  return ft;
}

export async function getKnowledgeGraph(_workspaceId: string): Promise<KnowledgeGraphBackend> {
  await sleep(30);
  const nodes: GraphNodeBackend[] = [];
  const edges: GraphEdgeBackend[] = [];
  const seen = new Set<string>();

  const notePaths = Array.from(fileStore.keys()).filter((p) => p.endsWith(".md"));
  for (const path of notePaths) {
    nodes.push({
      id: path,
      node_type: "note",
      reference_id: path,
      properties: { label: noteName(path), degree: 0 },
    });
    seen.add(path);
  }

  for (const path of notePaths) {
    const links = await extractLinks(fileStore.get(path)!, path);
    for (const l of links) {
      if (!seen.has(l.target_file)) {
        nodes.push({
          id: l.target_file,
          node_type: "note",
          reference_id: l.target_file,
          properties: { label: noteName(l.target_file), degree: 0 },
        });
        seen.add(l.target_file);
      }
      edges.push({
        id: `${path}->${l.target_file}`,
        source_node_id: path,
        target_node_id: l.target_file,
        edge_type: "reference",
        weight: 1,
        properties: {},
      });
    }
  }

  return { nodes, edges };
}

export async function indexKnowledgeBase(
  _workspaceId: string,
  _path: string,
): Promise<{ indexed: number; errors: string[] }> {
  await sleep(80);
  return { indexed: fileStore.size, errors: [] };
}

/* ============================================================
 *  Agent memory
 * ============================================================ */

const agents: Agent[] = [
  { id: "agent-ollama", name: "Ollama", type: "openclaw", memoryCount: 0, color: "#58a6ff" },
  { id: "agent-memgpt", name: "MemGPT", type: "memgpt", memoryCount: 0, color: "#d29922" },
];

const memories: MemoryBackendEntry[] = [
  {
    id: "mem-1",
    agent_id: "agent-ollama",
    content: "讨论了 Agent API 的接口形态，确认采用 Tauri commands。",
    title: "API 设计讨论",
    type: "conversation",
    importance: 0.7,
    last_accessed: null,
    access_count: 0,
    created_at: "2026-06-01T14:23:00+08:00",
    updated_at: "2026-06-01T14:23:00+08:00",
    metadata: { agentName: "Ollama", tags: ["ai", "agent"] },
    tags: ["ai", "agent"],
  },
  {
    id: "mem-2",
    agent_id: "agent-memgpt",
    content: "更新了 logging.level 为 info。",
    title: "配置更新 server.yaml",
    type: "procedure",
    importance: 0.5,
    last_accessed: null,
    access_count: 0,
    created_at: "2026-06-01T12:10:00+08:00",
    updated_at: "2026-06-01T12:10:00+08:00",
    metadata: { agentName: "MemGPT", tags: ["config"] },
    tags: ["config"],
  },
  {
    id: "mem-3",
    agent_id: "agent-ollama",
    content: "根据用户指令创建了 project-note。",
    title: "创建 project-note.md",
    type: "procedure",
    importance: 0.4,
    last_accessed: null,
    access_count: 0,
    created_at: "2026-06-01T09:00:00+08:00",
    updated_at: "2026-06-01T09:00:00+08:00",
    metadata: { agentName: "Ollama", tags: ["笔记"] },
    tags: ["笔记"],
  },
  {
    id: "mem-4",
    agent_id: "agent-memgpt",
    content: "加载并解析了 knowledge-base。",
    title: "读取 knowledge-base.md",
    type: "fact",
    importance: 0.3,
    last_accessed: null,
    access_count: 0,
    created_at: "2026-05-31T20:30:00+08:00",
    updated_at: "2026-05-31T20:30:00+08:00",
    metadata: { agentName: "MemGPT", tags: ["知识管理"] },
    tags: ["知识管理"],
  },
  {
    id: "mem-5",
    agent_id: "agent-ollama",
    content: "调整了文档结构，补充了 IPC 命令清单。",
    title: "修改 agent-api.md",
    type: "procedure",
    importance: 0.6,
    last_accessed: null,
    access_count: 0,
    created_at: "2026-05-31T15:45:00+08:00",
    updated_at: "2026-05-31T15:45:00+08:00",
    metadata: { agentName: "Ollama", tags: ["ai", "agent"] },
    tags: ["ai", "agent"],
  },
];

function recountAgents(): void {
  for (const a of agents) {
    const list = memories.filter((m) => m.agent_id === a.id);
    a.memoryCount = list.length;
    a.lastUpdated = list.length
      ? list.reduce((acc, m) => (m.updated_at > acc ? m.updated_at : acc), list[0].updated_at)
      : undefined;
  }
}
recountAgents();

export async function listAgents(): Promise<Agent[]> {
  await sleep();
  recountAgents();
  return [...agents];
}

export async function listMemories(agentId?: string, type?: MemoryType): Promise<MemoryBackendEntry[]> {
  await sleep();
  return memories
    .filter((m) => (agentId ? m.agent_id === agentId : true))
    .filter((m) => (type ? m.type === type : true))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getMemoryTimeline(
  agentId?: string,
  startDate?: string,
  endDate?: string,
): Promise<MemoryBackendEntry[]> {
  await sleep();
  return memories
    .filter((m) => (agentId ? m.agent_id === agentId : true))
    .filter((m) => (startDate ? m.created_at >= startDate : true))
    .filter((m) => (endDate ? m.created_at <= endDate : true))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function createMemory(
  agentId: string,
  content: string,
  type: MemoryType,
  title?: string,
  tags: string[] = [],
): Promise<{ id: string }> {
  await sleep();
  const id = uuid();
  const now = new Date().toISOString();
  memories.unshift({
    id,
    agent_id: agentId,
    content,
    title: title || content.slice(0, 30),
    type,
    importance: 0.5,
    last_accessed: null,
    access_count: 0,
    created_at: now,
    updated_at: now,
    metadata: {
      agentName: agents.find((a) => a.id === agentId)?.name || null,
    },
    tags: tags.length ? tags : [],
  });
  recountAgents();
  return { id };
}

export async function updateMemory(
  memoryId: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await sleep();
  const m = memories.find((x) => x.id === memoryId);
  if (!m) throw new Error("MEMORY_NOT_FOUND");
  m.content = content;
  m.metadata = { ...(m.metadata || {}), ...(metadata || {}) };
  m.updated_at = new Date().toISOString();
}

export async function deleteMemory(memoryId: string): Promise<void> {
  await sleep();
  const idx = memories.findIndex((x) => x.id === memoryId);
  if (idx === -1) throw new Error("MEMORY_NOT_FOUND");
  memories.splice(idx, 1);
  recountAgents();
}

export async function batchTagMemories(memoryIds: string[], tags: string[]): Promise<void> {
  await sleep();
  for (const id of memoryIds) {
    const m = memories.find((x) => x.id === id);
    if (!m) continue;
    const existingTags = m.tags ?? [];
    const set = new Set([...existingTags, ...tags]);
    m.tags = Array.from(set);
    m.updated_at = new Date().toISOString();
  }
}

export async function batchDeleteMemories(memoryIds: string[]): Promise<void> {
  await sleep();
  for (const id of memoryIds) {
    const idx = memories.findIndex((x) => x.id === id);
    if (idx >= 0) memories.splice(idx, 1);
  }
  recountAgents();
}

export async function importAgentMemories(
  agentId: string,
  format: string,
  data: string,
): Promise<{ imported: number; errors: string[] }> {
  await sleep(80);
  // Pretend to parse — count newline-separated chunks
  const lines = data.split(/\n{2,}/).filter((s) => s.trim());
  let imported = 0;
  const errors: string[] = [];
  for (const line of lines) {
    try {
      await createMemory(agentId, line.trim(), "fact", line.slice(0, 40));
      imported++;
    } catch (e) {
      errors.push(String(e));
    }
  }
  return { imported, errors };
}

export async function monitorMemoryDirectory(
  agentId: string,
  _path: string,
): Promise<{ watcherId: string }> {
  await sleep();
  return { watcherId: `watcher-${agentId}-${uuid()}` };
}

/* ============================================================
 *  AI service
 * ============================================================ */

export async function aiRefine(
  content: string,
  instruction: string,
  _model?: string,
): Promise<AIRefineResult> {
  await sleep(400);
  const result = `${content.trim()}\n\n[AI 精炼 — 指令: ${instruction}]\n该段落经过结构整理与表达打磨，更聚焦核心论点；术语保持一致，关键事实未变。`;
  return {
    result,
    diff: `+${result}\n-${content}`,
  };
}

export async function aiSummary(content: string, _model?: string): Promise<{ summary: string }> {
  await sleep(300);
  const sentences = content.split(/[。.!?]/).filter(Boolean).slice(0, 2);
  return { summary: sentences.join("。") + "。" };
}

export async function aiSuggestTags(content: string, _model?: string): Promise<{ tags: string[] }> {
  await sleep(200);
  const seeded = await extractTags(content);
  return { tags: Array.from(new Set([...seeded, "AI建议", "重要"])).slice(0, 6) };
}

export async function aiSuggestLinks(
  content: string,
  existingNotes: string[],
  _model?: string,
): Promise<{ suggestions: AISuggestedLink[] }> {
  await sleep(200);
  const matches = existingNotes
    .filter((n) => content.toLowerCase().includes(noteName(n).toLowerCase().slice(0, 3)))
    .slice(0, 5);
  return {
    suggestions: matches.map((m, i) => ({
      filePath: m,
      reason: "标题片段在当前正文中出现",
      confidence: 0.9 - i * 0.1,
    })),
  };
}

export async function aiKnowledgeQA(
  question: string,
  _workspaceId: string,
  _model?: string,
): Promise<{ answer: string; sources: string[] }> {
  await sleep(500);
  const top = await searchFulltext("", question, 3);
  return {
    answer: `根据 ${top.length} 篇笔记综合：${
      top[0]?.content || "暂无足够上下文回答该问题。"
    } (示例回答)`,
    sources: top.map((t) => t.file_path),
  };
}

export async function listAIModels(type: "local" | "cloud"): Promise<ModelInfo[]> {
  await sleep();
  if (type === "local") {
    return [
      { id: "qwen2.5:7b", name: "Qwen 2.5 7B", provider: "ollama", available: true, latencyMs: 22 },
      { id: "llama3.1:8b", name: "Llama 3.1 8B", provider: "ollama", available: true, latencyMs: 31 },
      { id: "deepseek-r1:7b", name: "DeepSeek R1 7B", provider: "ollama", available: false },
    ];
  }
  return [
    { id: "gpt-4o", name: "GPT-4o", provider: "openai", available: false },
    { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "anthropic", available: false },
  ];
}

export async function configureAIModel(
  _provider: string,
  _apiKey?: string,
  _endpoint?: string,
): Promise<void> {
  await sleep();
}

/* ============================================================
 *  App config
 * ============================================================ */

let appConfigBackend: AppConfigBackend = {
  theme: "system",
  auto_save: true,
  auto_save_interval: 5000,
  font_size: 14,
  tab_size: 2,
  word_wrap: true,
  show_line_numbers: true,
  minimap: true,
  ai_model: "qwen2.5:7b",
  ollama_endpoint: "http://localhost:11434",
};

export async function getAppConfig(): Promise<AppConfigBackend> {
  await sleep();
  return { ...appConfigBackend };
}

export async function updateAppConfig(config: Partial<AppConfigBackend>): Promise<void> {
  await sleep();
  appConfigBackend = { ...appConfigBackend, ...config };
}

export async function getTheme(): Promise<{ theme: string }> {
  await sleep();
  return { theme: appConfigBackend.theme };
}

export async function setTheme(theme: string): Promise<void> {
  await sleep();
  appConfigBackend.theme = theme;
}

/* ---------- Scratch drafts (browser localStorage) ------------------ */

const SCRATCH_BUFFERS_KEY = "noteforge:scratch:buffers";
const SCRATCH_SESSION_KEY = "noteforge:scratch:session";

function readScratchBuffers(): Record<string, ScratchBufferPayload> {
  try {
    const raw = localStorage.getItem(SCRATCH_BUFFERS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ScratchBufferPayload>) : {};
  } catch {
    return {};
  }
}

function writeScratchBuffers(map: Record<string, ScratchBufferPayload>) {
  localStorage.setItem(SCRATCH_BUFFERS_KEY, JSON.stringify(map));
}

export async function scratchSaveBuffer(payload: ScratchBufferPayload): Promise<void> {
  await sleep(10);
  const map = readScratchBuffers();
  map[payload.scratchId] = payload;
  writeScratchBuffers(map);
}

export async function scratchLoadBuffer(
  scratchId: string,
): Promise<ScratchBufferPayload | null> {
  await sleep(10);
  return readScratchBuffers()[scratchId] ?? null;
}

export async function scratchDeleteBuffer(scratchId: string): Promise<void> {
  await sleep(10);
  const map = readScratchBuffers();
  delete map[scratchId];
  writeScratchBuffers(map);
}

export async function scratchSaveSession(session: ScratchSessionPayload): Promise<void> {
  await sleep(10);
  localStorage.setItem(SCRATCH_SESSION_KEY, JSON.stringify(session));
}

export async function scratchRestoreSession(): Promise<ScratchRestoreResponse> {
  await sleep(20);
  const raw = localStorage.getItem(SCRATCH_SESSION_KEY);
  const session = raw ? (JSON.parse(raw) as ScratchSessionPayload) : null;
  const buffers = Object.values(readScratchBuffers());
  return { session, buffers };
}

export async function vaultStartWatch(rootPath: string): Promise<string> {
  await sleep(5);
  return `stub-watch-${rootPath}`;
}

export async function vaultStopWatch(): Promise<void> {
  await sleep(5);
}

export async function scratchClearSession(): Promise<void> {
  await sleep(10);
  localStorage.removeItem(SCRATCH_SESSION_KEY);
}

const WORKBENCH_SESSION_KEY = "noteforge:workbench-session:stub";

export async function workbenchSaveSession(session: string | null): Promise<void> {
  await sleep(10);
  if (session === null) {
    localStorage.removeItem(WORKBENCH_SESSION_KEY);
    return;
  }
  localStorage.setItem(WORKBENCH_SESSION_KEY, session);
}

export async function workbenchLoadSession(): Promise<string | null> {
  await sleep(10);
  return localStorage.getItem(WORKBENCH_SESSION_KEY);
}

const DRAFT_BUFFERS_KEY = "noteforge:workspace-drafts:stub";

function readDraftBuffers(): Record<string, WorkspaceDraftPayload> {
  try {
    const raw = localStorage.getItem(DRAFT_BUFFERS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, WorkspaceDraftPayload>) : {};
  } catch {
    return {};
  }
}

function writeDraftBuffers(map: Record<string, WorkspaceDraftPayload>): void {
  localStorage.setItem(DRAFT_BUFFERS_KEY, JSON.stringify(map));
}

export async function draftSaveBuffer(payload: WorkspaceDraftPayload): Promise<void> {
  await sleep(10);
  const map = readDraftBuffers();
  map[payload.vaultPath] = payload;
  writeDraftBuffers(map);
}

export async function draftLoadBuffer(vaultPath: string): Promise<WorkspaceDraftPayload | null> {
  await sleep(10);
  return readDraftBuffers()[vaultPath] ?? null;
}

export async function draftDeleteBuffer(vaultPath: string): Promise<void> {
  await sleep(10);
  const map = readDraftBuffers();
  delete map[vaultPath];
  writeDraftBuffers(map);
}

/* ============================================================
 *  Local History (in-memory stub)
 * ============================================================ */

const HISTORY_KEY = "noteforge:local-history:stub";

interface StubSnapshot {
  timestamp: string;
  size: number;
  vaultPath: string;
  content: string;
}

function readHistoryStore(): Record<string, StubSnapshot[]> {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StubSnapshot[]>) : {};
  } catch {
    return {};
  }
}

function writeHistoryStore(store: Record<string, StubSnapshot[]>): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(store));
}

export async function historySaveSnapshot(
  vaultPath: string,
  content: string,
): Promise<{ timestamp: string; size: number; vaultPath: string }> {
  await sleep(10);
  const store = readHistoryStore();
  const ts = new Date().toISOString();
  const snap: StubSnapshot = {
    timestamp: ts,
    size: new TextEncoder().encode(content).length,
    vaultPath,
    content,
  };
  if (!store[vaultPath]) store[vaultPath] = [];
  store[vaultPath].unshift(snap);
  // Keep max 50
  if (store[vaultPath].length > 50) store[vaultPath].length = 50;
  writeHistoryStore(store);
  return { timestamp: ts, size: snap.size, vaultPath };
}

export async function historyListSnapshots(
  vaultPath: string,
): Promise<{ timestamp: string; size: number; vaultPath: string }[]> {
  await sleep(10);
  const store = readHistoryStore();
  return (store[vaultPath] ?? []).map(({ timestamp, size, vaultPath: vp }) => ({
    timestamp,
    size,
    vaultPath: vp,
  }));
}

export async function historyLoadSnapshot(
  vaultPath: string,
  timestamp: string,
): Promise<string | null> {
  await sleep(10);
  const store = readHistoryStore();
  const snap = (store[vaultPath] ?? []).find((s) => s.timestamp === timestamp);
  return snap?.content ?? null;
}

export async function historyPruneSnapshots(_vaultPath: string): Promise<void> {
  await sleep(5);
  // Stub: no-op (real backend handles retention policy)
}

export async function historyDelete(vaultPath: string): Promise<void> {
  await sleep(10);
  const store = readHistoryStore();
  delete store[vaultPath];
  writeHistoryStore(store);
}
