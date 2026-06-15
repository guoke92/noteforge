use tauri::State;

use crate::error::NoteforgeError;
use crate::models::scratch::{
    ScratchBufferPayload, ScratchRestoreResponse, ScratchSessionPayload,
};
use crate::scratch::ScratchStore;

#[tauri::command]
pub fn scratch_save_buffer(
    store: State<'_, ScratchStore>,
    payload: ScratchBufferPayload,
) -> Result<(), NoteforgeError> {
    store.save_buffer(&payload)
}

#[tauri::command]
pub fn scratch_load_buffer(
    store: State<'_, ScratchStore>,
    scratch_id: String,
) -> Result<Option<ScratchBufferPayload>, NoteforgeError> {
    store.load_buffer(&scratch_id)
}

#[tauri::command]
pub fn scratch_delete_buffer(
    store: State<'_, ScratchStore>,
    scratch_id: String,
) -> Result<(), NoteforgeError> {
    store.delete_buffer(&scratch_id)
}

#[tauri::command]
pub fn scratch_save_session(
    store: State<'_, ScratchStore>,
    session: ScratchSessionPayload,
) -> Result<(), NoteforgeError> {
    store.save_session(&session)
}

#[tauri::command]
pub fn scratch_restore_session(
    store: State<'_, ScratchStore>,
) -> Result<ScratchRestoreResponse, NoteforgeError> {
    store.restore()
}

#[tauri::command]
pub fn scratch_clear_session(store: State<'_, ScratchStore>) -> Result<(), NoteforgeError> {
    store.clear_session()
}
