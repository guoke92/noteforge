use tauri::State;

use crate::error::NoteforgeError;
use crate::local_history::{LocalHistoryStore, SnapshotMeta};

#[tauri::command]
pub fn history_save_snapshot(
    store: State<'_, LocalHistoryStore>,
    vault_path: String,
    content: String,
) -> Result<SnapshotMeta, NoteforgeError> {
    store.save_snapshot(&vault_path, &content)
}

#[tauri::command]
pub fn history_list_snapshots(
    store: State<'_, LocalHistoryStore>,
    vault_path: String,
) -> Result<Vec<SnapshotMeta>, NoteforgeError> {
    Ok(store.list_snapshots(&vault_path))
}

#[tauri::command]
pub fn history_load_snapshot(
    store: State<'_, LocalHistoryStore>,
    vault_path: String,
    timestamp: String,
) -> Result<String, NoteforgeError> {
    store.load_snapshot(&vault_path, &timestamp)
}

#[tauri::command]
pub fn history_prune_snapshots(
    store: State<'_, LocalHistoryStore>,
    vault_path: String,
    max_count: Option<usize>,
    max_age_days: Option<i64>,
) -> Result<(), NoteforgeError> {
    store.prune_snapshots(
        &vault_path,
        max_count.unwrap_or(50),
        max_age_days.unwrap_or(30),
    )
}

#[tauri::command]
pub fn history_delete(
    store: State<'_, LocalHistoryStore>,
    vault_path: String,
) -> Result<(), NoteforgeError> {
    store.delete_history(&vault_path)
}
