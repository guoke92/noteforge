#![allow(dead_code)]

use notify::{Watcher, RecursiveMode, Event, EventKind};
use std::collections::HashMap;
use std::path::Path;
use std::sync::mpsc::{channel, Receiver};
use crate::error::NoteforgeError;

pub struct FileWatcher {
    watchers: HashMap<String, Box<dyn Watcher>>,
    _receiver: Receiver<Result<Event, notify::Error>>,
}

impl FileWatcher {
    pub fn new() -> Result<Self, NoteforgeError> {
        let (sender, receiver) = channel();
        
        let watcher = notify::recommended_watcher(sender)
            .map_err(|e| NoteforgeError::Notify(e))?;
        
        let mut watchers: HashMap<String, Box<dyn Watcher>> = HashMap::new();
        watchers.insert("default".to_string(), Box::new(watcher));
        
        Ok(Self { watchers, _receiver: receiver })
    }
    
    pub fn start_watching(
        &mut self,
        path: &Path,
        callback: Box<dyn Fn(FileEvent) + Send + Sync>,
    ) -> Result<String, NoteforgeError> {
        let watcher_id = uuid::Uuid::new_v4().to_string();
        
        let (sender, receiver) = channel();
        let mut watcher = notify::recommended_watcher(sender)
            .map_err(|e| NoteforgeError::Notify(e))?;
        
        watcher.watch(path, RecursiveMode::Recursive)
            .map_err(|e| NoteforgeError::Notify(e))?;
        
        self.watchers.insert(watcher_id.clone(), Box::new(watcher));
        
        // Spawn a thread to handle events
        std::thread::spawn(move || {
            loop {
                match receiver.recv() {
                    Ok(Ok(event)) => {
                        let file_event = match event {
                            Event { kind: EventKind::Create(_), paths, .. } => {
                                if let Some(path) = paths.first() {
                                    Some(FileEvent::Created { path: path.to_string_lossy().to_string() })
                                } else {
                                    None
                                }
                            }
                            Event { kind: EventKind::Modify(_), paths, .. } => {
                                if let Some(path) = paths.first() {
                                    Some(FileEvent::Modified { path: path.to_string_lossy().to_string() })
                                } else {
                                    None
                                }
                            }
                            Event { kind: EventKind::Remove(_), paths, .. } => {
                                if let Some(path) = paths.first() {
                                    Some(FileEvent::Deleted { path: path.to_string_lossy().to_string() })
                                } else {
                                    None
                                }
                            }
                            Event { kind: EventKind::Any, paths, .. } => {
                                // For rename events, we get two paths
                                if paths.len() >= 2 {
                                    Some(FileEvent::Renamed {
                                        old_path: paths[0].to_string_lossy().to_string(),
                                        new_path: paths[1].to_string_lossy().to_string(),
                                    })
                                } else {
                                    None
                                }
                            }
                            _ => None,
                        };
                        
                        if let Some(event) = file_event {
                            callback(event);
                        }
                    }
                    Ok(Err(e)) => {
                        eprintln!("Watch error: {:?}", e);
                        break;
                    }
                    Err(e) => {
                        eprintln!("Channel error: {:?}", e);
                        break;
                    }
                }
            }
        });
        
        Ok(watcher_id)
    }
    
    pub fn stop_watching(&mut self, watcher_id: &str) -> Result<(), NoteforgeError> {
        self.watchers.remove(watcher_id);
        Ok(())
    }
    
    pub fn list_watchers(&self) -> Vec<WatcherInfo> {
        self.watchers.keys().map(|id| WatcherInfo {
            id: id.clone(),
            active: true,
        }).collect()
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum FileEvent {
    Created { path: String },
    Modified { path: String },
    Deleted { path: String },
    Renamed { old_path: String, new_path: String },
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WatcherInfo {
    pub id: String,
    pub active: bool,
}