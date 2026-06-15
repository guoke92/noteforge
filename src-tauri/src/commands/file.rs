use std::path::{Path, PathBuf};
use crate::error::NoteforgeError;
use crate::models::{FileEntry, ReadFileResponse};

pub fn ensure_real_file_path(path: &str) -> Result<PathBuf, NoteforgeError> {
    if path.contains("://") || path.starts_with("untitled:") {
        return Err(NoteforgeError::InvalidInput(
            "Virtual document paths cannot be used for file operations".to_string(),
        ));
    }
    Ok(PathBuf::from(path))
}

#[tauri::command]
pub fn read_file(path: String) -> Result<ReadFileResponse, NoteforgeError> {
    let path = ensure_real_file_path(&path)?;
    let path = path.as_path();
    if !path.exists() {
        return Err(NoteforgeError::NotFound("File not found".to_string()));
    }

    let content = std::fs::read_to_string(path).map_err(NoteforgeError::Io)?;
    let language = detect_language_from_path(path);

    Ok(ReadFileResponse { content, language })
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), NoteforgeError> {
    let path = ensure_real_file_path(&path)?;
    let path = path.as_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(NoteforgeError::Io)?;
    }

    std::fs::write(path, content).map_err(NoteforgeError::Io)?;
    Ok(())
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, NoteforgeError> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(NoteforgeError::NotFound("Path not found".to_string()));
    }

    let mut entries = Vec::new();

    for entry in std::fs::read_dir(path).map_err(NoteforgeError::Io)? {
        let entry = entry.map_err(NoteforgeError::Io)?;
        let metadata = entry.metadata().map_err(NoteforgeError::Io)?;

        let name = entry.file_name().to_string_lossy().to_string();
        let path_str = entry.path().to_string_lossy().to_string();
        let is_dir = metadata.is_dir();
        let size = metadata.len();
        let modified = metadata
            .modified()
            .map(|t| {
                let datetime: chrono::DateTime<chrono::Utc> = t.into();
                datetime.to_rfc3339()
            })
            .unwrap_or_default();

        entries.push(FileEntry {
            name,
            path: path_str,
            is_dir,
            size,
            modified,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn create_file(path: String, content: Option<String>) -> Result<(), NoteforgeError> {
    let path = ensure_real_file_path(&path)?;
    let path = path.as_path();
    if path.exists() {
        return Err(NoteforgeError::InvalidInput(
            "File already exists".to_string(),
        ));
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(NoteforgeError::Io)?;
    }

    let content = content.unwrap_or_default();
    std::fs::write(path, content).map_err(NoteforgeError::Io)?;
    Ok(())
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), NoteforgeError> {
    let path = ensure_real_file_path(&path)?;
    let path = path.as_path();
    if !path.exists() {
        return Err(NoteforgeError::NotFound("File not found".to_string()));
    }

    if path.is_dir() {
        std::fs::remove_dir_all(path).map_err(NoteforgeError::Io)?;
    } else {
        std::fs::remove_file(path).map_err(NoteforgeError::Io)?;
    }

    Ok(())
}

#[tauri::command]
pub fn rename_file(old_path: String, new_path: String) -> Result<(), NoteforgeError> {
    let old = ensure_real_file_path(&old_path)?;
    let new = ensure_real_file_path(&new_path)?;
    let old = old.as_path();
    let new = new.as_path();

    if !old.exists() {
        return Err(NoteforgeError::NotFound("File not found".to_string()));
    }

    if new.exists() {
        return Err(NoteforgeError::InvalidInput(
            "Target file already exists".to_string(),
        ));
    }

    std::fs::rename(old, new).map_err(NoteforgeError::Io)?;
    Ok(())
}

#[tauri::command]
pub fn move_file(source: String, destination: String) -> Result<(), NoteforgeError> {
    let src = ensure_real_file_path(&source)?;
    let dst = ensure_real_file_path(&destination)?;
    let src = src.as_path();
    let dst = dst.as_path();

    if !src.exists() {
        return Err(NoteforgeError::NotFound(
            "Source file not found".to_string(),
        ));
    }

    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(NoteforgeError::Io)?;
    }

    std::fs::rename(src, dst).map_err(NoteforgeError::Io)?;
    Ok(())
}

fn detect_language_from_path(path: &Path) -> String {
    match path.extension().and_then(|e| e.to_str()) {
        Some("rs") => "rust".to_string(),
        Some("js") | Some("jsx") => "javascript".to_string(),
        Some("ts") | Some("tsx") => "typescript".to_string(),
        Some("py") => "python".to_string(),
        Some("java") => "java".to_string(),
        Some("c") | Some("h") => "c".to_string(),
        Some("cpp") | Some("hpp") => "cpp".to_string(),
        Some("go") => "go".to_string(),
        Some("html") | Some("htm") => "html".to_string(),
        Some("css") => "css".to_string(),
        Some("json") => "json".to_string(),
        Some("yaml") | Some("yml") => "yaml".to_string(),
        Some("toml") => "toml".to_string(),
        Some("md") => "markdown".to_string(),
        Some("txt") => "text".to_string(),
        _ => "text".to_string(),
    }
}
