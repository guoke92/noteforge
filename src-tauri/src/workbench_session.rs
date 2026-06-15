use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::NoteforgeError;

/// Layer B — window session (tab list, layout, viewState). Opaque JSON from frontend.
pub struct WorkbenchSessionStore {
    path: PathBuf,
}

impl WorkbenchSessionStore {
    pub fn new(app: &AppHandle) -> Result<Self, NoteforgeError> {
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| NoteforgeError::Internal(e.to_string()))?;
        let root = app_dir.join("workbench");
        fs::create_dir_all(&root).map_err(NoteforgeError::Io)?;
        Ok(Self {
            path: root.join("session.json"),
        })
    }

    pub fn save(&self, session: Option<&str>) -> Result<(), NoteforgeError> {
        if session.is_none() {
            if self.path.exists() {
                fs::remove_file(&self.path).map_err(NoteforgeError::Io)?;
            }
            return Ok(());
        }
        let data = session.unwrap();
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, data).map_err(NoteforgeError::Io)?;
        fs::rename(&tmp, &self.path).map_err(NoteforgeError::Io)?;
        Ok(())
    }

    pub fn load(&self) -> Result<Option<String>, NoteforgeError> {
        if !self.path.exists() {
            return Ok(None);
        }
        let data = fs::read_to_string(&self.path).map_err(NoteforgeError::Io)?;
        Ok(Some(data))
    }
}

pub fn init_workbench_session(app: &AppHandle) -> Result<(), NoteforgeError> {
    let store = WorkbenchSessionStore::new(app)?;
    app.manage(store);
    Ok(())
}
