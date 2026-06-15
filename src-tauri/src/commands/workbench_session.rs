use tauri::State;

use crate::error::NoteforgeError;
use crate::workbench_session::WorkbenchSessionStore;

#[tauri::command]
pub fn workbench_save_session(
    store: State<'_, WorkbenchSessionStore>,
    session: Option<String>,
) -> Result<(), NoteforgeError> {
    store.save(session.as_deref())
}

#[tauri::command]
pub fn workbench_load_session(
    store: State<'_, WorkbenchSessionStore>,
) -> Result<Option<String>, NoteforgeError> {
    store.load()
}
