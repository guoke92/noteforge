use std::path::Path;
use std::sync::Mutex;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::error::NoteforgeError;

#[derive(Default)]
pub struct VaultWatchState {
    active: Mutex<Option<ActiveVaultWatch>>,
}

struct ActiveVaultWatch {
    root_path: String,
    watcher_id: String,
    _watcher: RecommendedWatcher,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum VaultWatchEventPayload {
    #[serde(rename = "modified")]
    Modified { path: String },
    #[serde(rename = "created")]
    Created { path: String },
    #[serde(rename = "deleted")]
    Deleted { path: String },
    #[serde(rename = "renamed")]
    Renamed {
        #[serde(rename = "oldPath")]
        old_path: String,
        #[serde(rename = "newPath")]
        new_path: String,
    },
}

fn map_event(event: Event) -> Option<VaultWatchEventPayload> {
    let primary = event.paths.first()?;
    if primary.is_dir() {
        return None;
    }

    let path = primary.to_string_lossy().to_string();

    match event.kind {
        EventKind::Create(_) => Some(VaultWatchEventPayload::Created { path }),
        EventKind::Modify(kind) => {
            use notify::event::ModifyKind;
            match kind {
                ModifyKind::Name(_) if event.paths.len() >= 2 => {
                    let old_path = event.paths[0].to_string_lossy().to_string();
                    let new_path = event.paths[1].to_string_lossy().to_string();
                    Some(VaultWatchEventPayload::Renamed {
                        old_path: old_path,
                        new_path: new_path,
                    })
                }
                ModifyKind::Data(_) | ModifyKind::Metadata(_) => {
                    Some(VaultWatchEventPayload::Modified { path })
                }
                _ => None,
            }
        }
        EventKind::Remove(_) => Some(VaultWatchEventPayload::Deleted { path }),
        _ => None,
    }
}

#[tauri::command]
pub fn vault_start_watch(
    app: AppHandle,
    root_path: String,
    state: State<'_, VaultWatchState>,
) -> Result<String, NoteforgeError> {
    let path = Path::new(&root_path);
    if !path.exists() {
        return Err(NoteforgeError::NotFound(format!(
            "Vault path not found: {root_path}"
        )));
    }

    let mut guard = state
        .active
        .lock()
        .map_err(|_| NoteforgeError::Internal("Vault watch lock poisoned".to_string()))?;

    if let Some(existing) = guard.as_ref() {
        if existing.root_path == root_path {
            return Ok(existing.watcher_id.clone());
        }
        *guard = None;
    }

    let watcher_id = Uuid::new_v4().to_string();
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(tx).map_err(NoteforgeError::Notify)?;
    watcher
        .watch(path, RecursiveMode::Recursive)
        .map_err(NoteforgeError::Notify)?;

    let app_handle = app.clone();
    std::thread::spawn(move || {
        while let Ok(result) = rx.recv() {
            match result {
                Ok(event) => {
                    if let Some(payload) = map_event(event) {
                        let _ = app_handle.emit("vault-file-event", &payload);
                    }
                }
                Err(error) => {
                    eprintln!("vault watch error: {error:?}");
                    break;
                }
            }
        }
    });

    *guard = Some(ActiveVaultWatch {
        root_path: root_path.clone(),
        watcher_id: watcher_id.clone(),
        _watcher: watcher,
    });

    Ok(watcher_id)
}

#[tauri::command]
pub fn vault_stop_watch(state: State<'_, VaultWatchState>) -> Result<(), NoteforgeError> {
    let mut guard = state
        .active
        .lock()
        .map_err(|_| NoteforgeError::Internal("Vault watch lock poisoned".to_string()))?;
    *guard = None;
    Ok(())
}
