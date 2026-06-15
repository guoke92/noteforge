use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::NoteforgeError;
use crate::models::workspace_draft::WorkspaceDraftPayload;

pub struct WorkspaceDraftStore {
    root: PathBuf,
}

impl WorkspaceDraftStore {
    pub fn new(app: &AppHandle) -> Result<Self, NoteforgeError> {
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| NoteforgeError::Internal(e.to_string()))?;
        let root = app_dir.join("drafts");
        fs::create_dir_all(&root).map_err(NoteforgeError::Io)?;
        Ok(Self { root })
    }

    fn draft_path(vault_path: &str) -> String {
        let mut hasher = DefaultHasher::new();
        vault_path.hash(&mut hasher);
        format!("{:016x}", hasher.finish())
    }

    fn buffer_path(&self, vault_path: &str) -> PathBuf {
        self.root.join(format!("{}.json", Self::draft_path(vault_path)))
    }

    pub fn save(&self, payload: &WorkspaceDraftPayload) -> Result<(), NoteforgeError> {
        let path = self.buffer_path(&payload.vault_path);
        let data = serde_json::to_string_pretty(payload).map_err(NoteforgeError::Json)?;
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, &data).map_err(NoteforgeError::Io)?;
        fs::rename(&tmp, &path).map_err(NoteforgeError::Io)?;
        Ok(())
    }

    pub fn load(&self, vault_path: &str) -> Result<Option<WorkspaceDraftPayload>, NoteforgeError> {
        let path = self.buffer_path(vault_path);
        if !path.exists() {
            return Ok(None);
        }
        let data = fs::read_to_string(&path).map_err(NoteforgeError::Io)?;
        let payload: WorkspaceDraftPayload = serde_json::from_str(&data).map_err(NoteforgeError::Json)?;
        Ok(Some(payload))
    }

    pub fn delete(&self, vault_path: &str) -> Result<(), NoteforgeError> {
        let path = self.buffer_path(vault_path);
        if path.exists() {
            fs::remove_file(&path).map_err(NoteforgeError::Io)?;
        }
        Ok(())
    }
}

pub fn init_workspace_draft(app: &AppHandle) -> Result<(), NoteforgeError> {
    let store = WorkspaceDraftStore::new(app)?;
    app.manage(store);
    Ok(())
}
