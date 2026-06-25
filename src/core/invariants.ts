/**
 * Architecture invariants — Phase 0 gate checklist.
 * Code reviews should verify these hold after every PR touching core layers.
 */

export const INVARIANTS = {
  /** ADR-001 */
  SINGLE_CONTENT_SOURCE:
    "Canonical content lives on DocumentRecord.content only. Surfaces emit patches; they do not persist independently.",

  /** ADR-002 */
  DOCUMENT_VAULT_BOUNDARY:
    "DocumentService owns content/dirty/viewState. VaultService owns paths and FS metadata. Saves go Document → Vault.",

  /** ADR-003 */
  KNOWLEDGE_READ_ONLY:
    "KnowledgeQueryService never writes files or mutates DocumentService.",

  /** ADR-004 */
  ONE_INSTANCE_PER_PATH:
    "At most one DocumentRecord per non-null vaultPath. Split views reference the same documentId.",

  /** ADR-005 / NFEP */
  MODE_SWITCH_FLUSH:
    "Switching live/source flushes surface edits through DocumentService.applyPatch before remount.",

  /** ADR-006 */
  FULL_SESSION:
    "WorkspaceSession restores vault files, layout, tabs, and viewStates — not scratch-only subsets.",

  /** ADR-007 */
  COMMAND_ENTRY:
    "User actions register in CommandRegistry. No ad-hoc keyboard handlers in components.",

  /** ADR-008 */
  LINK_PATH_IDENTITY:
    "Wiki links resolve by vault path. Renames emit vault:file-renamed for index migration.",
} as const;

/** Phase 0 definition of done — binary gate before Phase 1 (Milkdown). */
export const PHASE_0_DOD = [
  "VaultService.pickVaultRoot opens native folder dialog",
  "DocumentService.open/create/save/autosave/conflict flows implemented",
  "One document instance per vaultPath enforced",
  "VaultService file watcher drives notifyExternalChange",
  "WorkspaceSession v2 restores tabs + viewStates + ephemeral docs",
  "CommandRegistry wires FILE_NEW, FILE_SAVE, NAV_QUICK_OPEN",
  "DialogService replaces close/save-as/conflict ui.ts flags",
  "EventBus emits document:* and vault:* for future knowledge indexer",
  "Legacy scratch/session code path removed or bridged with deprecation",
] as const;

/** NFEP Phase 0 — platform skeleton + Monaco markdown transitional. */
export const NFEP_P0_DOD = [
  "SurfaceRegistry resolves editor surfaces by content kind",
  "MarkdownLanguageService provides shared parse/outline/wikilink",
  "Milkdown/Crepe removed",
  "Surface modes are live | source only",
  "Markdown live/source use Monaco until CM6 Hybrid (P1)",
] as const;

/** NFEP Phase 1 — CM6 Typora-style hybrid (in progress). */
export const NFEP_P1_DOD = [
  "Markdown live mode uses CM6 Hybrid IR (single buffer)",
  "live ↔ source toggles CM6 decorations without remount",
  "EditorHostService flushes surfaces on mode switch (ADR-005)",
  "Outline revealLine works in live without forcing source",
  "Wiki links render and navigate in live mode",
  "GFM tables editable in live mode",
] as const;
