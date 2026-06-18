/** Shared timing constants for editor and session subsystems. */

export const EDITOR_CONTENT_DEBOUNCE_MS = 200;

export const SCRATCH_AUTOSAVE_DEBOUNCE_MS = 1500;

/** Debounce after document content edits before writing session.json. */
export const SESSION_PERSIST_CONTENT_DEBOUNCE_MS = 2000;

/** Debounce after tab/layout changes (faster than content). */
export const SESSION_PERSIST_LAYOUT_DEBOUNCE_MS = 400;

/** @deprecated Use SESSION_PERSIST_CONTENT_DEBOUNCE_MS / SESSION_PERSIST_LAYOUT_DEBOUNCE_MS */
export const SESSION_PERSIST_DEBOUNCE_MS = SESSION_PERSIST_CONTENT_DEBOUNCE_MS;

export const KNOWLEDGE_REINDEX_DEBOUNCE_MS = 1500;

/** Defer first vault index until after splash + initial interaction. */
export const KNOWLEDGE_STARTUP_DEFER_MS = 8000;

export const VAULT_POLL_INTERVAL_MS = 3000;

export const MILKDOWN_READONLY_POLL_MS = 30;
