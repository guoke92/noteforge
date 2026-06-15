import type { VaultPath } from "../events";

/**
 * ADR-003: Read-only projection. Populated by index worker reacting to document/vault events.
 * Editor and DocumentService must NOT call write methods here.
 */

export interface NoteIndexEntry {
  vaultPath: VaultPath;
  title: string;
  mtime: string;
  contentHash: string;
  tags: string[];
  aliases: string[];
}

export interface LinkIndexEntry {
  sourcePath: VaultPath;
  targetPath: VaultPath | null; // null = unresolved wiki target name
  targetName: string;
  line: number;
  alias?: string;
}

export interface HeadingIndexEntry {
  vaultPath: VaultPath;
  level: number;
  text: string;
  line: number;
  slug: string;
}

export interface BacklinkHit {
  sourcePath: VaultPath;
  line: number;
  context: string;
}

export interface WikiResolveResult {
  path: VaultPath | null;
  targetName: string;
  exists: boolean;
  /** Candidates for autocomplete. */
  suggestions: Array<{ path: VaultPath; title: string; score: number }>;
}

export interface KnowledgeQueryService {
  getNote(path: VaultPath): NoteIndexEntry | null;

  getBacklinks(path: VaultPath): BacklinkHit[] | Promise<BacklinkHit[]>;

  getHeadings(path: VaultPath): HeadingIndexEntry[];

  getOutgoingLinks(path: VaultPath): LinkIndexEntry[];

  resolveWikiLink(targetName: string, fromPath?: VaultPath): WikiResolveResult;

  searchTitles(query: string, limit?: number): Array<{ path: VaultPath; title: string; score: number }>;

  /** Full rebuild — vault opened or corruption detected. */
  reindexAll(): Promise<void>;
}
