import { detectLanguageFromContent, isMarkdownTab } from "@/lib/editor-doc";
import { detectLanguageFromName } from "@/lib/utils";
import type { EventBus, DocumentId, VaultPath } from "../events";
import { DEFAULT_PREFERENCES } from "../platform/config";
import type { VaultServiceImpl } from "../vault/vault-service.impl";
import type { DocumentService } from "./service";
import type {
  ConflictInfo,
  ConflictResolution,
  ContentPatch,
  CreateEphemeralOptions,
  DocumentRecord,
  OpenDocumentOptions,
  SaveTarget,
  ViewState,
} from "./types";
import { basename, buildDiskRevision, newDocumentId } from "./utils";
import {
  deleteWorkspaceDraft,
  loadWorkspaceDraft,
} from "../session/workspace-draft-autosave";
import {
  promptDraftRestoreConflict,
  promptSaveConflict,
} from "../dialog/draft-prompt";

export interface DocumentServiceDeps {
  eventBus: EventBus;
  vault: VaultServiceImpl;
  onDocumentsChanged?: () => void;
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

  function notifyChange() {
    deps.onDocumentsChanged?.();
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
    notifyChange();
  }

  function removeRecord(id: DocumentId) {
    const record = documents.get(id);
    if (record?.vaultPath) {
      pathIndex.delete(record.vaultPath);
      vault.untrackForWatch(record.vaultPath);
    }
    documents.delete(id);
    conflicts.delete(id);
    notifyChange();
  }

  function applyContent(record: DocumentRecord, content: string): DocumentRecord {
    const language = detectLanguage(record.vaultPath, content, record.language);
    const next: DocumentRecord = {
      ...record,
      content,
      language,
      dirty: content !== record.baseline,
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
  ): Promise<{ content: string; dirty: boolean }> {
    const draft = await loadWorkspaceDraft(vaultPath);
    if (!draft) {
      return { content: diskContent, dirty: false };
    }
    if (draft.content === diskContent) {
      await deleteWorkspaceDraft(vaultPath);
      return { content: diskContent, dirty: false };
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

  const service: DocumentService = {
    list() {
      return [...documents.values()];
    },

    get(documentId) {
      return documents.get(documentId) ?? null;
    },

    async open(vaultPath, options = {}) {
      const existing = getByPath(vaultPath);
      if (existing) {
        eventBus.emit({
          type: "document:opened",
          documentId: existing.id,
          vaultPath,
        });
        return existing;
      }

      const { content: diskContent, revision, eol } = await vault.readText(vaultPath);
      const id = newDocumentId();
      const { content, dirty } = await resolveInitialWorkspaceContent(
        vaultPath,
        id,
        diskContent,
        revision,
      );
      const title = basename(vaultPath);
      const language = detectLanguage(vaultPath, content);
      const record: DocumentRecord = {
        id,
        vaultPath,
        title,
        content,
        baseline: diskContent,
        dirty,
        lifecycle: "persisted",
        disk: { revision, content: diskContent, encoding: "utf-8", eol },
        viewState: defaultViewState(options.initialMode),
        language,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setRecord(record);
      eventBus.emit({ type: "document:opened", documentId: id, vaultPath });
      void vault.startWatching();
      return record;
    },

    createEphemeral(options = {}) {
      const id = options.id ?? newDocumentId();
      const content = options.content ?? "";
      const record: DocumentRecord = {
        id,
        vaultPath: null,
        title: options.title ?? "",
        content,
        baseline: content,
        dirty: false,
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
      if (!record) return;
      if (patch.kind === "replace-all") {
        applyContent(record, patch.content);
        return;
      }
      const next =
        record.content.slice(0, patch.start) + patch.insert + record.content.slice(patch.end);
      applyContent(record, next);
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

      const { content: diskContent, revision, eol } = await vault.readText(vaultPath);

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
        lifecycle: "persisted",
        disk: {
          revision: afterWrite.revision,
          content: record.content,
          encoding: "utf-8",
          eol: afterWrite.eol,
        },
        language: detectLanguage(vaultPath, record.content, record.language),
        updatedAt: Date.now(),
      };
      setRecord(next);
      conflicts.delete(documentId);
      eventBus.emit({ type: "document:saved", documentId, vaultPath });
      return vaultPath;
    },

    async revert(documentId) {
      const record = documents.get(documentId);
      if (!record?.vaultPath) return;
      const { content, revision, eol } = await vault.readText(record.vaultPath);
      await deleteWorkspaceDraft(record.vaultPath);
      const next: DocumentRecord = {
        ...record,
        content,
        baseline: content,
        dirty: false,
        lifecycle: "persisted",
        disk: { revision, content, encoding: "utf-8", eol },
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

      const { content, revision, eol } = await vault.readText(vaultPath);
      if (record.disk?.revision === revision) return;

      const next: DocumentRecord = {
        ...record,
        content,
        baseline: content,
        dirty: false,
        lifecycle: "persisted",
        disk: { revision, content, encoding: "utf-8", eol },
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
