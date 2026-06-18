use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::NoteforgeError;

/// Maximum number of snapshots to retain per vault path.
const DEFAULT_MAX_COUNT: usize = 50;
/// Maximum age in days for snapshots.
const DEFAULT_MAX_AGE_DAYS: i64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub timestamp: String,
    pub size: u64,
    pub vault_path: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct MetaIndex {
    snapshots: Vec<SnapshotMeta>,
}

pub struct LocalHistoryStore {
    root: PathBuf,
}

impl LocalHistoryStore {
    pub fn new(app: &AppHandle) -> Result<Self, NoteforgeError> {
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| NoteforgeError::Internal(e.to_string()))?;
        let root = app_dir.join("history");
        fs::create_dir_all(&root).map_err(NoteforgeError::Io)?;
        Ok(Self { root })
    }

    fn hash_path(vault_path: &str) -> String {
        let mut hasher = DefaultHasher::new();
        vault_path.hash(&mut hasher);
        format!("{:016x}", hasher.finish())
    }

    fn dir_for(&self, vault_path: &str) -> PathBuf {
        self.root.join(Self::hash_path(vault_path))
    }

    fn meta_path(&self, vault_path: &str) -> PathBuf {
        self.dir_for(vault_path).join("meta.json")
    }

    fn snapshot_path(&self, vault_path: &str, timestamp: &str) -> PathBuf {
        self.dir_for(vault_path).join(format!("{timestamp}.snapshot"))
    }

    fn read_meta(&self, vault_path: &str) -> MetaIndex {
        let path = self.meta_path(vault_path);
        if !path.exists() {
            return MetaIndex::default();
        }
        match fs::read_to_string(&path) {
            Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
            Err(_) => MetaIndex::default(),
        }
    }

    fn write_meta(&self, vault_path: &str, meta: &MetaIndex) -> Result<(), NoteforgeError> {
        let path = self.meta_path(vault_path);
        let data = serde_json::to_string_pretty(meta).map_err(NoteforgeError::Json)?;
        fs::write(&path, data).map_err(NoteforgeError::Io)?;
        Ok(())
    }

    pub fn save_snapshot(
        &self,
        vault_path: &str,
        content: &str,
    ) -> Result<SnapshotMeta, NoteforgeError> {
        let dir = self.dir_for(vault_path);
        fs::create_dir_all(&dir).map_err(NoteforgeError::Io)?;

        let now = Utc::now();
        let timestamp = now.format("%Y%m%dT%H%M%S%.3fZ").to_string();

        let snap_path = self.snapshot_path(vault_path, &timestamp);
        fs::write(&snap_path, content).map_err(NoteforgeError::Io)?;

        let snapshot = SnapshotMeta {
            timestamp,
            size: content.len() as u64,
            vault_path: vault_path.to_string(),
        };

        let mut meta = self.read_meta(vault_path);
        meta.snapshots.push(snapshot.clone());

        // Auto-prune
        Self::prune_meta(&mut meta, DEFAULT_MAX_COUNT, DEFAULT_MAX_AGE_DAYS);
        self.write_meta(vault_path, &meta)?;

        // Clean up orphaned snapshot files not in meta
        if let Ok(entries) = fs::read_dir(&dir) {
            let known: std::collections::HashSet<String> = meta
                .snapshots
                .iter()
                .map(|s| format!("{}.snapshot", s.timestamp))
                .collect();
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".snapshot") && !known.contains(&name) {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }

        Ok(snapshot)
    }

    pub fn list_snapshots(&self, vault_path: &str) -> Vec<SnapshotMeta> {
        let meta = self.read_meta(vault_path);
        // Return newest first
        let mut snapshots = meta.snapshots;
        snapshots.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        snapshots
    }

    pub fn load_snapshot(
        &self,
        vault_path: &str,
        timestamp: &str,
    ) -> Result<String, NoteforgeError> {
        let path = self.snapshot_path(vault_path, timestamp);
        if !path.exists() {
            return Err(NoteforgeError::NotFound("Snapshot not found".to_string()));
        }
        fs::read_to_string(&path).map_err(NoteforgeError::Io)
    }

    pub fn prune_snapshots(
        &self,
        vault_path: &str,
        max_count: usize,
        max_age_days: i64,
    ) -> Result<(), NoteforgeError> {
        let mut meta = self.read_meta(vault_path);
        Self::prune_meta(&mut meta, max_count, max_age_days);
        self.write_meta(vault_path, &meta)?;

        // Clean up pruned files
        let dir = self.dir_for(vault_path);
        if let Ok(entries) = fs::read_dir(&dir) {
            let known: std::collections::HashSet<String> = meta
                .snapshots
                .iter()
                .map(|s| format!("{}.snapshot", s.timestamp))
                .collect();
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".snapshot") && !known.contains(&name) {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
        Ok(())
    }

    pub fn delete_history(&self, vault_path: &str) -> Result<(), NoteforgeError> {
        let dir = self.dir_for(vault_path);
        if dir.exists() {
            fs::remove_dir_all(&dir).map_err(NoteforgeError::Io)?;
        }
        Ok(())
    }

    fn prune_meta(meta: &mut MetaIndex, max_count: usize, max_age_days: i64) {
        // Sort oldest first for pruning
        meta.snapshots.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        let cutoff = Utc::now() - Duration::days(max_age_days);
        let cutoff_str = cutoff.format("%Y%m%dT%H%M%S%.3fZ").to_string();

        // Remove snapshots older than cutoff
        meta.snapshots.retain(|s| s.timestamp >= cutoff_str);

        // Keep only the newest max_count
        if meta.snapshots.len() > max_count {
            let drain_count = meta.snapshots.len() - max_count;
            meta.snapshots.drain(..drain_count);
        }
    }
}

pub fn init_local_history(app: &AppHandle) -> Result<(), NoteforgeError> {
    let store = LocalHistoryStore::new(app)?;
    app.manage(store);
    Ok(())
}
