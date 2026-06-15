use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::NoteforgeError;
use crate::models::scratch::{
    ScratchBufferPayload, ScratchRestoreResponse, ScratchSessionPayload,
};

pub struct ScratchStore {
    root: PathBuf,
}

impl ScratchStore {
    pub fn new(app: &AppHandle) -> Result<Self, NoteforgeError> {
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| NoteforgeError::Internal(e.to_string()))?;
        let root = app_dir.join("scratch");
        fs::create_dir_all(root.join("buffers")).map_err(NoteforgeError::Io)?;
        Ok(Self { root })
    }

    fn buffer_path(&self, scratch_id: &str) -> PathBuf {
        self.root.join("buffers").join(format!("{scratch_id}.json"))
    }

    fn session_path(&self) -> PathBuf {
        self.root.join("session.json")
    }

    pub fn save_buffer(&self, payload: &ScratchBufferPayload) -> Result<(), NoteforgeError> {
        let path = self.buffer_path(&payload.scratch_id);
        let data = serde_json::to_string_pretty(payload).map_err(NoteforgeError::Json)?;
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, &data).map_err(NoteforgeError::Io)?;
        fs::rename(&tmp, &path).map_err(NoteforgeError::Io)?;
        Ok(())
    }

    pub fn load_buffer(&self, scratch_id: &str) -> Result<Option<ScratchBufferPayload>, NoteforgeError> {
        let path = self.buffer_path(scratch_id);
        if !path.exists() {
            return Ok(None);
        }
        let data = fs::read_to_string(&path).map_err(NoteforgeError::Io)?;
        let payload: ScratchBufferPayload = serde_json::from_str(&data).map_err(NoteforgeError::Json)?;
        Ok(Some(payload))
    }

    pub fn delete_buffer(&self, scratch_id: &str) -> Result<(), NoteforgeError> {
        let path = self.buffer_path(scratch_id);
        if path.exists() {
            fs::remove_file(&path).map_err(NoteforgeError::Io)?;
        }
        Ok(())
    }

    pub fn save_session(&self, session: &ScratchSessionPayload) -> Result<(), NoteforgeError> {
        let path = self.session_path();
        let data = serde_json::to_string_pretty(session).map_err(NoteforgeError::Json)?;
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, &data).map_err(NoteforgeError::Io)?;
        fs::rename(&tmp, &path).map_err(NoteforgeError::Io)?;
        Ok(())
    }

    pub fn restore(&self) -> Result<ScratchRestoreResponse, NoteforgeError> {
        let session_path = self.session_path();
        let session = if session_path.exists() {
            let data = fs::read_to_string(&session_path).map_err(NoteforgeError::Io)?;
            Some(serde_json::from_str(&data).map_err(NoteforgeError::Json)?)
        } else {
            None
        };

        let mut buffers = Vec::new();
        let buffers_dir = self.root.join("buffers");
        if buffers_dir.exists() {
            for entry in fs::read_dir(&buffers_dir).map_err(NoteforgeError::Io)? {
                let entry = entry.map_err(NoteforgeError::Io)?;
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                if let Ok(data) = fs::read_to_string(&path) {
                    if let Ok(buf) = serde_json::from_str::<ScratchBufferPayload>(&data) {
                        buffers.push(buf);
                    }
                }
            }
        }

        Ok(ScratchRestoreResponse { session, buffers })
    }

    pub fn clear_session(&self) -> Result<(), NoteforgeError> {
        let path = self.session_path();
        if path.exists() {
            fs::remove_file(&path).map_err(NoteforgeError::Io)?;
        }
        Ok(())
    }
}

pub fn init_scratch(app: &AppHandle) -> Result<(), NoteforgeError> {
    let store = ScratchStore::new(app)?;
    app.manage(store);
    Ok(())
}
