import type { VaultPath } from "../events";

export interface VaultDescriptor {
  id: string;
  name: string;
  rootPath: VaultPath;
  autoIndex: boolean;
  excludePatterns: string[];
}

export interface VaultTreeNode {
  path: VaultPath;
  name: string;
  isDir: boolean;
  size?: number;
  modified?: string;
  children?: VaultTreeNode[];
}

export interface WriteFileOptions {
  createDirs?: boolean;
  encoding?: "utf-8";
  eol?: "lf" | "crlf";
}

export interface CreateNoteOptions {
  /** Directory relative to vault root or absolute within vault. */
  parentDir: VaultPath;
  filename: string;
  content?: string;
  templateId?: string;
}

export interface RenameEntryOptions {
  newName: string;
}

/** ADR-008: Links index by vaultPath; rename emits vault:file-renamed for migration. */
export interface FileChangeEvent {
  kind: "created" | "changed" | "deleted" | "renamed";
  path: VaultPath;
  oldPath?: VaultPath;
}
