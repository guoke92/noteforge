import { detectLanguageFromContent } from "@/lib/editor-doc";
import { detectLanguageFromName } from "@/lib/utils";
import type { EventBus, DocumentId, VaultPath } from "../events";
import { DEFAULT_PREFERENCES } from "../platform/config";
import type { VaultServiceImpl } from "../vault/vault-service.impl";
import type { DocumentService } from "./service";
import type {
  ConflictInfo,
  DocumentRecord,
  OpenDocumentOptions,
  SaveTarget,
  ViewState,
} from "./types";
import { basename, buildStatRevision, newDocumentId } from "./utils";
import { getFileTier } from "./file-tier";
import {
  deleteWorkspaceDraft,
  loadWorkspaceDraft,
} from "../session/workspace-draft-autosave";
import {
  promptDraftRestoreConflict,
  promptSaveConflict,
} from "../dialog/draft-prompt";
import { perfAsync, perfLog, perfStart } from "@/lib/startup-perf";

export interface DocumentServiceDeps {
  eventBus: EventBus;
  vault: VaultServiceImpl;
  onDocumentsChanged?: (documentId: DocumentId) => void;
}

function defaultViewState(initialMode?: ViewState["mode"]): ViewState {
  return { mode: initialMode ?? DEFAULT_PREFERENCES.editor.defaultSurfaceMode };
}

function detectLanguage(path: VaultPath | null, content: string, fallback?: string): string {
  if (path) {
    return detectLanguageFromName(basename(path)) || fallback || "plaintext";
  }
  return detectLanguageFromContent(content) ?? fallback ?? "plaintext";
}

export class SaveCancelledError extends Error {
  constructor() {
    super("Save cancelled");
    this.name = "SaveCancelledError";
  }
}

export function createDocumentService(deps: DocumentServiceDeps): DocumentService {
  const { eventBus, vault } = deps;
  const documents = new Map<DocumentId, DocumentRecord>();
  const pathIndex = new Map<VaultPath, DocumentId>();
  const conflicts = new Map<DocumentId, ConflictInfo>();

  function notifyChange(documentId: DocumentId) {
    deps.onDocumentsChanged?.(documentId);
  }

  function getByPath(path: VaultPath): DocumentRecord | null {
    const id = pathIndex.get(path);
    return id ? (documents.get(id) ?? null) : null;
  }

  function setRecord(record: DocumentRecord) {
    documents.set(record.id, record);
    if (record.vaultPath) {
      pathIndex.set(record.vaultPath, record.id);
      if (record.disk?.revision) {
        vault.trackForWatch(record.vaultPath, record.disk.revision);
      }
    }
    notifyChange(record.id);
  }

  function removeRecord(id: DocumentId) {
    const record = documents.get(id);
    if (record?.vaultPath) {
      pathIndex.delete(record.vaultPath);
      vault.untrackForWatch(record.vaultPath);
    }
    documents.delete(id);
    conflicts.delete(id);
    notifyChange(id);
  }

  function applyContent(record: DocumentRecord, content: string): DocumentRecord {
    const language = detectLanguage(record.vaultPath, content, record.language);
    const nextRevision = record.revision + 1;
    const next: DocumentRecord = {
      ...record,
      content,
      language,
      revision: nextRevision,
      dirty: nextRevision !== record.savedRevision,
      updatedAt: Date.now(),
    };
    setRecord(next);
    eventBus.emit({
      type: "document:changed",
      documentId: record.id,
      vaultPath: record.vaultPath,
    });
    return next;
  }

  async function resolveInitialWorkspaceContent(
    vaultPath: VaultPath,
    documentId: DocumentId,
    diskContent: string,
    diskRevision: string,
    diskByteSize?: number,
    diskMtime?: string,
    restoreSession?: boolean,
  ): Promise<{ content: string; dirty: boolean }> {
    const draft = await loadWorkspaceDraft(vaultPath);
    if (!draft) {
      return { content: diskContent, dirty: false };
    }

    // O(1) change detection: if draft recorded disk mtime+size and they match current disk,
    // disk is unchanged → draft is the latest user edit (skip O(n) content comparison).
    const currentMtime = diskMtime ?? diskRevision.split(":")[0] ?? "";
    const currentSize = diskByteSize ?? new TextEncoder().encode(diskContent).length;
    const draftLooksLikeAccidentalEmpty =
      draft.content.length === 0 && diskContent.trim().length > 0;
    if (draftLooksLikeAccidentalEmpty) {
      await deleteWorkspaceDraft(vaultPath);
      return { content: diskContent, dirty: false };
    }
    if (
      draft.diskMtime &&
      draft.diskSize !== undefined &&
      draft.diskMtime === currentMtime &&
      draft.diskSize === currentSize
    ) {
      // Disk unchanged since draft was saved → draft is the dirty version
      return { content: draft.content, dirty: true };
    }

    // Fallback: full content comparison
    if (draft.content === diskContent) {
      await deleteWorkspaceDraft(vaultPath);
      return { content: diskContent, dirty: false };
    }

    if (restoreSession) {
      // Bootstrap must not block on dialogs hidden behind splash.
      return { content: draft.content, dirty: true };
    }

    const choice = await promptDraftRestoreConflict({
      documentId,
      vaultPath,
      localContent: draft.content,
      diskContent,
      diskRevision,
      reason: "restore",
    });

    if (choice === "disk") {
      await deleteWorkspaceDraft(vaultPath);
      return { content: diskContent, dirty: false };
    }
    return { content: draft.content, dirty: true };
  }

  async function readDiskIntoRecord(
    vaultPath: VaultPath,
    options: OpenDocumentOptions,
    stat?: { size: number; mtime: string },
  ): Promise<DocumentRecord> {
    const end = perfStart("document.readDiskIntoRecord", {
      vaultPath,
      restoreSession: !!options.restoreSession,
      size: stat?.size,
    });
    const { content: diskContent, revision, eol, mtime } = await vault.readText(vaultPath);
    const id = newDocumentId();
    const { content, dirty } = await resolveInitialWorkspaceContent(
      vaultPath,
      id,
      diskContent,
      revision,
      stat?.size,
      stat?.mtime ?? mtime,
      options.restoreSession,
    );
    const title = basename(vaultPath);
    const language = detectLanguage(vaultPath, content);
    const fileSize = stat?.size ?? new TextEncoder().encode(diskContent).length;
    const record: DocumentRecord = {
      id,
      vaultPath,
      title,
      content,
      baseline: diskContent,
      dirty,
      revision: dirty ? 1 : 0,
      savedRevision: 0,
      fileSize,
      tier: getFileTier(fileSize),
      contentLoaded: true,
      lifecycle: "persisted",
      disk: {
        revision,
        content: diskContent,
        encoding: "utf-8",
        eol,
        mtime: stat?.mtime ?? mtime,
      },
      viewState: defaultViewState(options.initialMode),
      language,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setRecord(record);
    eventBus.emit({ type: "document:opened", documentId: id, vaultPath });
    void vault.startWatching();
    end();
    perfLog("document.readDiskIntoRecord.done", {
      tier: record.tier,
      bytes: fileSize,
      dirty: record.dirty,
    });
    return record;
  }

  async function openHugeLazy(
    vaultPath: VaultPath,
    options: OpenDocumentOptions,
    stat: { size: number; mtime: string },
  ): Promise<DocumentRecord> {
    const end = perfStart("document.openHugeLazy", {
      vaultPath,
      bytes: stat.size,
      hasDraft: false,
    });
    const statRevision = buildStatRevision(stat.mtime, stat.size);
    const draft = await loadWorkspaceDraft(vaultPath);
    if (draft) perfLog("document.openHugeLazy.draft", { draftBytes: draft.content.length });

    if (draft) {
      const diskUnchanged =
        draft.diskMtime &&
        draft.diskSize !== undefined &&
        draft.diskMtime === stat.mtime &&
        draft.diskSize === stat.size;

      if (diskUnchanged) {
        const id = newDocumentId();
        const title = basename(vaultPath);
        const language = detectLanguage(vaultPath, draft.content);
        const record: DocumentRecord = {
          id,
          vaultPath,
          title,
          content: draft.content,
          baseline: "",
          dirty: true,
          revision: 1,
          savedRevision: 0,
          fileSize: stat.size,
          tier: "huge",
          contentLoaded: true,
          lifecycle: "persisted",
          disk: {
            revision: statRevision,
            content: "",
            encoding: "utf-8",
            eol: "lf",
            mtime: stat.mtime,
          },
          viewState: defaultViewState(options.initialMode),
          language,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setRecord(record);
        eventBus.emit({ type: "document:opened", documentId: id, vaultPath });
        void vault.startWatching();
        end();
        perfLog("document.openHugeLazy.from-draft", { bytes: stat.size });
        return record;
      }

      // Draft exists but disk may have changed — need full read for conflict UX.
      end();
      return readDiskIntoRecord(vaultPath, options, stat);
    }

    const id = newDocumentId();
    const title = basename(vaultPath);
    const language = detectLanguage(vaultPath, "");
    const record: DocumentRecord = {
      id,
      vaultPath,
      title,
      content: "",
      baseline: "",
      dirty: false,
      revision: 0,
      savedRevision: 0,
      fileSize: stat.size,
      tier: "huge",
      contentLoaded: false,
      lifecycle: "persisted",
      disk: {
        revision: statRevision,
        content: "",
        encoding: "utf-8",
        eol: "lf",
        mtime: stat.mtime,
      },
      viewState: defaultViewState(options.initialMode),
      language,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setRecord(record);
    eventBus.emit({ type: "document:opened", documentId: id, vaultPath });
    void vault.startWatching();
    end();
    perfLog("document.openHugeLazy.preview-only", { bytes: stat.size });
    return record;
  }

  async function ensureContentLoaded(documentId: DocumentId): Promise<DocumentRecord | null> {
    const end = perfStart("document.ensureContentLoaded", { documentId });
    const record = documents.get(documentId);
    if (!record || record.contentLoaded) {
      end();
      return record ?? null;
    }
    if (!record.vaultPath) {
      setRecord({ ...record, contentLoaded: true });
      end();
      return documents.get(documentId) ?? null;
    }

    const { content: diskContent, revision, eol, mtime } = await vault.readText(record.vaultPath);
    const { content, dirty } = await resolveInitialWorkspaceContent(
      record.vaultPath,
      documentId,
      diskContent,
      revision,
      record.fileSize,
      mtime,
      false,
    );
    const fileSize = new TextEncoder().encode(content).length;
    const next: DocumentRecord = {
      ...record,
      content,
      baseline: diskContent,
      dirty,
      revision: dirty ? Math.max(record.revision, 1) : 0,
      savedRevision: dirty ? record.savedRevision : 0,
      contentLoaded: true,
      fileSize,
      tier: getFileTier(fileSize),
      disk: { revision, content: diskContent, encoding: "utf-8", eol, mtime },
      language: detectLanguage(record.vaultPath, content, record.language),
      updatedAt: Date.now(),
    };
    setRecord(next);
    eventBus.emit({
      type: "document:changed",
      documentId,
      vaultPath: record.vaultPath,
    });
    end();
    perfLog("document.ensureContentLoaded.done", { bytes: fileSize, tier: next.tier });
    return next;
  }

  const service: DocumentService = {
    list() {
      return [...documents.values()];
    },

    get(documentId) {
      return documents.get(documentId) ?? null;
    },

    async open(vaultPath, options = {}) {
      return perfAsync(
        "document.open",
        async () => {
          const existing = getByPath(vaultPath);
          if (existing) {
            perfLog("document.open cache-hit", { vaultPath });
            eventBus.emit({
              type: "document:opened",
              documentId: existing.id,
              vaultPath,
            });
            return existing;
          }

          const stat = await vault.readStat(vaultPath);
          const tier = getFileTier(stat.size);
          perfLog("document.open.stat", { vaultPath, bytes: stat.size, tier });
          if (tier === "huge") {
            return openHugeLazy(vaultPath, options, stat);
          }
          return readDiskIntoRecord(vaultPath, options, stat);
        },
        { vaultPath, restoreSession: !!options.restoreSession },
      );
    },

    createEphemeral(options = {}) {
      const id = options.id ?? newDocumentId();
      const content = options.content ?? "";
      const fileSize = new TextEncoder().encode(content).length;
      const record: DocumentRecord = {
        id,
        vaultPath: null,
        title: options.title ?? "",
        content,
        baseline: content,
        dirty: false,
        revision: 0,
        savedRevision: 0,
        fileSize,
        tier: getFileTier(fileSize),
        contentLoaded: true,
        lifecycle: "ephemeral",
        disk: null,
        viewState: defaultViewState(options.initialMode),
        language: detectLanguage(null, content),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setRecord(record);
      eventBus.emit({ type: "document:opened", documentId: id, vaultPath: null });
      return record;
    },

    async close(documentId, options = {}) {
      const record = documents.get(documentId);
      if (!record) return true;
      if (record.dirty && !options.force) return false;
      removeRecord(documentId);
      eventBus.emit({ type: "document:closed", documentId });
      return true;
    },

    applyPatch(documentId, patch) {
      const record = documents.get(documentId);
      if (!record || !record.contentLoaded) return;
      if (patch.kind === "replace-all") {
        applyContent(record, patch.content);
        return;
      }
      const next =
        record.content.slice(0, patch.start) + patch.insert + record.content.slice(patch.end);
      applyContent(record, next);
    },

    ensureContentLoaded(documentId) {
      return ensureContentLoaded(documentId);
    },

    updateViewState(documentId, patch) {
      const record = documents.get(documentId);
      if (!record) return;
      setRecord({
        ...record,
        viewState: { ...record.viewState, ...patch },
        updatedAt: Date.now(),
      });
      eventBus.emit({ type: "document:view-state-changed", documentId });
    },

    async save(documentId, target: SaveTarget = { kind: "in-place" }) {
      await ensureContentLoaded(documentId);
      const record = documents.get(documentId);
      if (!record) throw new Error(`Document not found: ${documentId}`);

      let vaultPath: VaultPath;
      if (target.kind === "path") {
        vaultPath = target.vaultPath;
      } else if (record.vaultPath) {
        vaultPath = record.vaultPath;
      } else {
        throw new Error("Ephemeral document requires explicit save path");
      }

      const { content: diskContent, revision, eol: _eol } = await vault.readText(vaultPath);

      if (diskContent !== record.baseline) {
        const choice = await promptSaveConflict({
          documentId,
          vaultPath,
          localContent: record.content,
          diskContent,
          diskRevision: revision,
          reason: "save",
        });
        if (choice === "cancel") throw new SaveCancelledError();
        if (choice === "reload-from-disk") {
          await service.revert(documentId);
          return vaultPath;
        }
      }

      await vault.writeText(vaultPath, record.content);
      const afterWrite = await vault.readText(vaultPath);
      await deleteWorkspaceDraft(vaultPath);

      if (record.vaultPath && record.vaultPath !== vaultPath) {
        pathIndex.delete(record.vaultPath);
        vault.untrackForWatch(record.vaultPath);
        await deleteWorkspaceDraft(record.vaultPath);
      }

      const next: DocumentRecord = {
        ...record,
        vaultPath,
        title: basename(vaultPath),
        baseline: record.content,
        dirty: false,
        savedRevision: record.revision,
        lifecycle: "persisted",
        disk: {
          revision: afterWrite.revision,
          content: record.content,
          encoding: "utf-8",
          eol: afterWrite.eol,
          mtime: afterWrite.mtime,
        },
        language: detectLanguage(vaultPath, record.content, record.language),
        updatedAt: Date.now(),
      };
      setRecord(next);
      conflicts.delete(documentId);
      eventBus.emit({ type: "document:saved", documentId, vaultPath });
      return vaultPath;
    },

    async saveAs(documentId, vaultPath) {
      const record = documents.get(documentId);
      if (!record) throw new Error(`Document not found: ${documentId}`);

      const afterWrite = await vault.readText(vaultPath);

      // Clean up old path tracking if path changed
      if (record.vaultPath && record.vaultPath !== vaultPath) {
        pathIndex.delete(record.vaultPath);
        vault.untrackForWatch(record.vaultPath);
        await deleteWorkspaceDraft(record.vaultPath);
      }

      const next: DocumentRecord = {
        ...record,
        vaultPath,
        title: basename(vaultPath),
        baseline: record.content,
        dirty: false,
        savedRevision: record.revision,
        lifecycle: "persisted",
        disk: {
          revision: afterWrite.revision,
          content: record.content,
          encoding: "utf-8",
          eol: afterWrite.eol,
          mtime: afterWrite.mtime,
        },
        language: detectLanguage(vaultPath, record.content, record.language),
        updatedAt: Date.now(),
      };
      setRecord(next);
      conflicts.delete(documentId);
      eventBus.emit({ type: "document:saved", documentId, vaultPath });
    },

    async revert(documentId) {
      const record = documents.get(documentId);
      if (!record?.vaultPath) return;
      const { content, revision, eol, mtime } = await vault.readText(record.vaultPath);
      await deleteWorkspaceDraft(record.vaultPath);
      const next: DocumentRecord = {
        ...record,
        content,
        baseline: content,
        dirty: false,
        savedRevision: record.revision,
        contentLoaded: true,
        lifecycle: "persisted",
        disk: { revision, content, encoding: "utf-8", eol, mtime },
        updatedAt: Date.now(),
      };
      conflicts.delete(documentId);
      setRecord(next);
      eventBus.emit({ type: "document:changed", documentId, vaultPath: record.vaultPath });
    },

    async notifyExternalChange(vaultPath) {
      const record = getByPath(vaultPath);
      if (!record) return;
      if (record.dirty) return;

      if (!record.contentLoaded && record.tier === "huge") {
        const stat = await vault.readStat(vaultPath);
        const revision = buildStatRevision(stat.mtime, stat.size);
        if (record.disk?.revision === revision) return;
        const next: DocumentRecord = {
          ...record,
          fileSize: stat.size,
          disk: {
            revision,
            content: "",
            encoding: "utf-8",
            eol: record.disk?.eol ?? "lf",
            mtime: stat.mtime,
          },
          updatedAt: Date.now(),
        };
        setRecord(next);
        eventBus.emit({ type: "document:changed", documentId: record.id, vaultPath });
        return;
      }

      const { content, revision, eol, mtime } = await vault.readText(vaultPath);
      if (record.disk?.revision === revision) return;

      const fileSize = new TextEncoder().encode(content).length;
      const next: DocumentRecord = {
        ...record,
        content,
        baseline: content,
        dirty: false,
        savedRevision: record.revision,
        fileSize,
        tier: getFileTier(fileSize),
        contentLoaded: true,
        lifecycle: "persisted",
        disk: { revision, content, encoding: "utf-8", eol, mtime },
        updatedAt: Date.now(),
      };
      setRecord(next);
      eventBus.emit({ type: "document:changed", documentId: record.id, vaultPath });
    },

    getConflict(documentId) {
      return conflicts.get(documentId) ?? null;
    },

    async resolveConflict(documentId, resolution) {
      const conflict = conflicts.get(documentId);
      const record = documents.get(documentId);
      if (!conflict || !record) return;

      if (resolution === "reload-from-disk") {
        conflicts.delete(documentId);
        await service.revert(documentId);
        return;
      }

      if (resolution === "keep-local") {
        const next: DocumentRecord = {
          ...record,
          lifecycle: "persisted",
          disk: {
            revision: conflict.diskRevision,
            content: conflict.diskContent,
            encoding: "utf-8",
            eol: record.disk?.eol ?? "lf",
          },
        };
        conflicts.delete(documentId);
        setRecord(next);
        return;
      }

      if (resolution === "save-local-as-copy") {
        conflicts.delete(documentId);
        await service.save(documentId, { kind: "in-place" });
      }
    },

    async flushAutoSave() {
      const { flushAllDirtyWorkspaceDrafts } = await import(
        "../session/workspace-draft-autosave"
      );
      await flushAllDirtyWorkspaceDrafts();
    },
  };

  eventBus.subscribe("vault:file-changed", (event) => {
    void service.notifyExternalChange(event.vaultPath);
  });

  eventBus.subscribe("vault:file-deleted", (event) => {
    const record = getByPath(event.vaultPath);
    if (record) {
      setRecord({ ...record, lifecycle: "deleted-externally" });
    }
  });

  eventBus.subscribe("vault:file-renamed", (event) => {
    const record = getByPath(event.oldPath);
    if (!record) return;
    pathIndex.delete(event.oldPath);
    vault.untrackForWatch(event.oldPath);
    const next: DocumentRecord = {
      ...record,
      vaultPath: event.newPath,
      title: basename(event.newPath),
      updatedAt: Date.now(),
    };
    setRecord(next);
  });

  return service;
}
