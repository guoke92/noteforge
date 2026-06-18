import { knowledge as knowledgeIpc, isTauri } from "@/ipc";
import {
  KNOWLEDGE_REINDEX_DEBOUNCE_MS,
  KNOWLEDGE_STARTUP_DEFER_MS,
} from "../platform/timing";
import { useWorkspaceStore } from "@/store/workspace";
import {
  collectMarkdownNotes,
  resolveWikiTargetName,
  searchWikiTitles,
  type WikiNoteRef,
} from "@/lib/wiki-resolve";
import type { DocumentService } from "../document/service";
import type { EventBus, VaultPath } from "../events";
import type { VaultService } from "../vault/service";
import { perfLog } from "@/lib/startup-perf";
import type {
  BacklinkHit,
  HeadingIndexEntry,
  KnowledgeQueryService,
  LinkIndexEntry,
  WikiResolveResult,
} from "./types";

const WIKI_RE = /\[\[([^[\]]+?)\]\]/g;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;

export interface KnowledgeQueryServiceDeps {
  eventBus: EventBus;
  vault: VaultService;
  document: DocumentService;
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getNotes(): WikiNoteRef[] {
  return collectMarkdownNotes(useWorkspaceStore.getState().tree);
}

export function createKnowledgeQueryService(deps: KnowledgeQueryServiceDeps): KnowledgeQueryService {
  const { vault, document } = deps;

  function contentForPath(path: VaultPath): string | null {
    return document.list().find((d) => d.vaultPath === path)?.content ?? null;
  }

  const service: KnowledgeQueryService = {
    getNote(path) {
      const ref = getNotes().find((n) => n.path === path);
      if (!ref) return null;
      return {
        vaultPath: path,
        title: ref.title,
        mtime: "",
        contentHash: "",
        tags: [],
        aliases: [],
      };
    },

    async getBacklinks(path) {
      try {
        const hits = await knowledgeIpc.getBacklinks(path);
        return hits.map(
          (h): BacklinkHit => ({
            sourcePath: h.sourceFile,
            line: 0,
            context: h.snippet,
          }),
        );
      } catch {
        return [];
      }
    },

    getHeadings(path) {
      const content = contentForPath(path);
      if (!content) return [];
      const out: HeadingIndexEntry[] = [];
      content.split("\n").forEach((line, idx) => {
        const m = line.match(HEADING_RE);
        if (!m) return;
        const text = m[2]!.trim();
        out.push({
          vaultPath: path,
          level: m[1]!.length,
          text,
          line: idx + 1,
          slug: slugify(text),
        });
      });
      return out;
    },

    getOutgoingLinks(path) {
      const content = contentForPath(path);
      if (!content) return [];
      const notes = getNotes();
      const out: LinkIndexEntry[] = [];
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const m of line.matchAll(WIKI_RE)) {
          const raw = m[1]!.trim();
          const [name, alias] = raw.split("|").map((s) => s.trim());
          const resolved = resolveWikiTargetName(name, notes);
          out.push({
            sourcePath: path,
            targetPath: resolved.path,
            targetName: name,
            line: i + 1,
            alias: alias || undefined,
          });
        }
      }
      return out;
    },

    resolveWikiLink(targetName) {
      const notes = getNotes();
      const trimmed = targetName.trim();
      const resolved = resolveWikiTargetName(trimmed, notes);
      return {
        path: resolved.path,
        targetName: trimmed,
        exists: resolved.exists,
        suggestions: searchWikiTitles(trimmed, notes, 12),
      } satisfies WikiResolveResult;
    },

    searchTitles(query, limit = 20) {
      return searchWikiTitles(query, getNotes(), limit);
    },

    async reindexAll() {
      const current = vault.getCurrent();
      if (!current) {
        perfLog("knowledge.reindexAll skipped (no vault)");
        return;
      }
      if (!current.autoIndex) {
        perfLog("knowledge.reindexAll skipped (autoIndex off)", { rootPath: current.rootPath });
        return;
      }
      try {
        await knowledgeIpc.indexWorkspace(current.id, current.rootPath);
        perfLog("knowledge.reindexAll.scheduled", { rootPath: current.rootPath });
      } catch (e) {
        console.error("knowledge reindex failed", e);
        perfLog("knowledge.reindexAll.failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
  };

  return service;
}

export function wireKnowledgeIndexer(
  eventBus: EventBus,
  knowledge: KnowledgeQueryService,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let isFirstVaultOpen = true;

  const schedule = (delayMs = KNOWLEDGE_REINDEX_DEBOUNCE_MS) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      perfLog("knowledge.reindexAll scheduled (debounced)");
      void knowledge.reindexAll().catch(console.error);
    }, delayMs);
  };

  const scheduleStartup = () => {
    if (startupTimer) clearTimeout(startupTimer);
    perfLog("knowledge.reindexAll startup defer", { deferMs: KNOWLEDGE_STARTUP_DEFER_MS });
    startupTimer = setTimeout(() => {
      startupTimer = null;
      perfLog("knowledge.reindexAll scheduled (startup idle)");
      void knowledge.reindexAll().catch(console.error);
    }, KNOWLEDGE_STARTUP_DEFER_MS);
  };

  const unsubs = [
    eventBus.subscribe("vault:opened", () => {
      if (isFirstVaultOpen) {
        isFirstVaultOpen = false;
        scheduleStartup();
        return;
      }
      schedule();
    }),
    eventBus.subscribe("document:saved", () => schedule()),
    eventBus.subscribe("vault:file-created", () => schedule()),
    eventBus.subscribe("vault:file-deleted", () => schedule()),
    eventBus.subscribe("vault:file-renamed", () => schedule()),
  ];

  let unlistenComplete: (() => void) | null = null;
  if (isTauri()) {
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<{ workspaceId: string; indexed: number; skipped?: number; removed?: number }>(
        "knowledge-index-complete",
        (event) => {
        perfLog("knowledge.reindexAll.done", {
          indexed: event.payload.indexed,
          skipped: event.payload.skipped ?? 0,
          removed: event.payload.removed ?? 0,
          workspaceId: event.payload.workspaceId,
        });
      }).then((unlisten) => {
        unlistenComplete = unlisten;
      }),
    );
  }

  return () => {
    if (timer) clearTimeout(timer);
    if (startupTimer) clearTimeout(startupTimer);
    unlistenComplete?.();
    for (const unsub of unsubs) unsub();
  };
}

export type KnowledgeQueryServiceImpl = ReturnType<typeof createKnowledgeQueryService>;
