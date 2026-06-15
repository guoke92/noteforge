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

  /** ADR-005 — Phase 1 */
  MODE_SWITCH_FLUSH:
    "Switching write/source/read flushes surface edits through DocumentService.applyPatch before remount.",

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

/** Phase 1 definition of done — Milkdown write + readOnly read; no live split. */
export const PHASE_1_DOD = [
  "Surface modes are write | source | read only (live split removed)",
  "EditorHostService flushes surfaces on mode switch (ADR-005)",
  "write and read use Milkdown Crepe with wikilink remark plugin",
  "source uses Monaco markdown editor",
  "Outline revealLine works in write/read without forcing source",
  "Preview mode syncs DocumentService.viewState for session restore",
  "KnowledgeQueryService resolves wikilinks and backs backlinks IPC",
  "Daily note opens/creates Journal/YYYY-MM-DD.md via vault",
  "Properties panel shows YAML front matter for active document",
  "Outline panel jumps to heading line in editor",
  "Monaco [[ wikilink completion uses vault tree index",
  "Workbench closeTab respects dirty state and multi-pane docs",
] as const;
