use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::NoteforgeError;
use crate::models::workspace_draft::WorkspaceDraftPayload;

/// Content size threshold for raw text storage (2 MB).
const LARGE_DRAFT_THRESHOLD: usize = 2 * 1024 * 1024;

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

    fn raw_path(&self, vault_path: &str) -> PathBuf {
        self.root.join(format!("{}.raw", Self::draft_path(vault_path)))
    }

    fn meta_path(&self, vault_path: &str) -> PathBuf {
        self.root.join(format!("{}.meta", Self::draft_path(vault_path)))
    }

    pub fn save(&self, payload: &WorkspaceDraftPayload) -> Result<(), NoteforgeError> {
        let is_large = payload.content.len() >= LARGE_DRAFT_THRESHOLD;

        if is_large {
            // Large file: store content as raw text + metadata sidecar
            let raw_path = self.raw_path(&payload.vault_path);
            let meta_path = self.meta_path(&payload.vault_path);

            // Write raw content to temp file then rename (atomic)
            let tmp_raw = raw_path.with_extension("raw.tmp");
            fs::write(&tmp_raw, &payload.content).map_err(NoteforgeError::Io)?;
            fs::rename(&tmp_raw, &raw_path).map_err(NoteforgeError::Io)?;

            // Write metadata sidecar
            let meta = serde_json::json!({
                "vaultPath": payload.vault_path,
                "language": payload.language,
                "diskMtime": payload.disk_mtime,
                "diskSize": payload.disk_size,
            });
            let tmp_meta = meta_path.with_extension("meta.tmp");
            fs::write(&tmp_meta, serde_json::to_string_pretty(&meta).map_err(NoteforgeError::Json)?).map_err(NoteforgeError::Io)?;
            fs::rename(&tmp_meta, &meta_path).map_err(NoteforgeError::Io)?;

            // Clean up any legacy JSON file
            let json_path = self.buffer_path(&payload.vault_path);
            if json_path.exists() {
                let _ = fs::remove_file(&json_path);
            }
        } else {
            // Small file: store as JSON
            let path = self.buffer_path(&payload.vault_path);
            let data = serde_json::to_string_pretty(payload).map_err(NoteforgeError::Json)?;
            let tmp = path.with_extension("json.tmp");
            fs::write(&tmp, &data).map_err(NoteforgeError::Io)?;
            fs::rename(&tmp, &path).map_err(NoteforgeError::Io)?;

            // Clean up any raw files from when it was previously large
            let raw_path = self.raw_path(&payload.vault_path);
            if raw_path.exists() { let _ = fs::remove_file(&raw_path); }
            let meta_path = self.meta_path(&payload.vault_path);
            if meta_path.exists() { let _ = fs::remove_file(&meta_path); }
        }
        Ok(())
    }

    pub fn load(&self, vault_path: &str) -> Result<Option<WorkspaceDraftPayload>, NoteforgeError> {
        // Try raw + meta first (large file format)
        let raw_path = self.raw_path(vault_path);
        let meta_path = self.meta_path(vault_path);
        if raw_path.exists() && meta_path.exists() {
            let content = fs::read_to_string(&raw_path).map_err(NoteforgeError::Io)?;
            let meta_str = fs::read_to_string(&meta_path).map_err(NoteforgeError::Io)?;
            let meta: serde_json::Value = serde_json::from_str(&meta_str).map_err(NoteforgeError::Json)?;
            return Ok(Some(WorkspaceDraftPayload {
                vault_path: meta["vaultPath"].as_str().unwrap_or(vault_path).to_string(),
                content,
                language: meta["language"].as_str().unwrap_or("plaintext").to_string(),
                disk_mtime: meta["diskMtime"].as_str().map(|s| s.to_string()),
                disk_size: meta["diskSize"].as_u64(),
            }));
        }

        // Fall back to JSON format
        let path = self.buffer_path(vault_path);
        if !path.exists() {
            return Ok(None);
        }
        let data = fs::read_to_string(&path).map_err(NoteforgeError::Io)?;
        let payload: WorkspaceDraftPayload = serde_json::from_str(&data).map_err(NoteforgeError::Json)?;
        Ok(Some(payload))
    }

    pub fn delete(&self, vault_path: &str) -> Result<(), NoteforgeError> {
        // Remove all formats
        for path in [
            self.buffer_path(vault_path),
            self.raw_path(vault_path),
            self.meta_path(vault_path),
        ] {
            if path.exists() {
                fs::remove_file(&path).map_err(NoteforgeError::Io)?;
            }
        }
        Ok(())
    }
}

pub fn init_workspace_draft(app: &AppHandle) -> Result<(), NoteforgeError> {
    let store = WorkspaceDraftStore::new(app)?;
    app.manage(store);
    Ok(())
}
