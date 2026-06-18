import type { VaultPath } from "../events";
import type {
  CreateNoteOptions,
  RenameEntryOptions,
  VaultDescriptor,
  VaultTreeNode,
  WriteFileOptions,
} from "./types";

/**
 * ADR-002: Vault performs path-space operations only — no tab/session/view state.
 */
export interface VaultService {
  getCurrent(): VaultDescriptor | null;

  open(rootPath: VaultPath): Promise<VaultDescriptor>;

  close(): Promise<void>;

  listRecent(): Promise<VaultDescriptor[]>;

  readText(path: VaultPath): Promise<{
    content: string;
    eol: "lf" | "crlf";
    revision: string;
    mtime: string;
  }>;

  readStat(path: VaultPath): Promise<{
    size: number;
    mtime: string;
    lineCountEstimate: number;
  }>;

  writeText(path: VaultPath, content: string, options?: WriteFileOptions): Promise<void>;

  createNote(options: CreateNoteOptions): Promise<VaultPath>;

  createDirectory(parentDir: VaultPath, name: string): Promise<VaultPath>;

  rename(oldPath: VaultPath, options: RenameEntryOptions): Promise<VaultPath>;

  delete(path: VaultPath): Promise<void>;

  getTree(): VaultTreeNode | null;

  /** Lazy load children for tree UI. */
  loadChildren(dirPath: VaultPath): Promise<VaultTreeNode[]>;

  /** Native folder picker — replaces window.prompt. Phase 0. */
  pickVaultRoot(): Promise<VaultPath | null>;

  pickSavePath(defaultName: string, parentDir?: VaultPath): Promise<VaultPath | null>;

  /** Subscribe to OS-level file events under vault root. */
  startWatching(): Promise<void>;

  stopWatching(): Promise<void>;

  /** Track open document path + disk revision for external change detection. */
  trackForWatch(path: VaultPath, revision: string): void;

  untrackForWatch(path: VaultPath): void;
}
