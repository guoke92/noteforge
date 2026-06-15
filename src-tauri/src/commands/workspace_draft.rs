use tauri::State;

use crate::error::NoteforgeError;
use crate::models::workspace_draft::WorkspaceDraftPayload;
use crate::workspace_draft::WorkspaceDraftStore;

#[tauri::command]
pub fn draft_save_buffer(
    store: State<'_, WorkspaceDraftStore>,
    payload: WorkspaceDraftPayload,
) -> Result<(), NoteforgeError> {
    store.save(&payload)
}

#[tauri::command]
pub fn draft_load_buffer(
    store: State<'_, WorkspaceDraftStore>,
    vault_path: String,
) -> Result<Option<WorkspaceDraftPayload>, NoteforgeError> {
    store.load(&vault_path)
}

#[tauri::command]
pub fn draft_delete_buffer(
    store: State<'_, WorkspaceDraftStore>,
    vault_path: String,
) -> Result<(), NoteforgeError> {
    store.delete(&vault_path)
}
