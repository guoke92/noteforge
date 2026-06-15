use std::path::Path;

use crate::commands::file::ensure_real_file_path;
use crate::error::NoteforgeError;
use crate::models::{LanguageDetection, FormatCodeResponse, FileInfo};

#[tauri::command]
pub fn detect_language(content: String, filename: Option<String>) -> Result<LanguageDetection, NoteforgeError> {
    let language = if let Some(filename) = filename {
        detect_language_from_filename(std::path::Path::new(&filename))
    } else {
        detect_language_from_content(&content)
    };

    Ok(LanguageDetection {
        language,
        confidence: 0.8,
    })
}

#[tauri::command]
pub fn format_code(content: String, language: String) -> Result<FormatCodeResponse, NoteforgeError> {
    let formatted = match language.as_str() {
        "json" => format_json(&content)?,
        "markdown" => content,
        _ => content,
    };

    Ok(FormatCodeResponse { formatted })
}

#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileInfo, NoteforgeError> {
    let path = ensure_real_file_path(&path)?;
    let path = path.as_path();
    if !path.exists() {
        return Err(NoteforgeError::NotFound("File not found".to_string()));
    }

    let metadata = std::fs::metadata(path).map_err(NoteforgeError::Io)?;

    let size = metadata.len();
    let modified = metadata
        .modified()
        .map(|t| {
            let datetime: chrono::DateTime<chrono::Utc> = t.into();
            datetime.to_rfc3339()
        })
        .unwrap_or_default();

    let language = detect_language_from_filename(path);

    Ok(FileInfo {
        size,
        modified,
        language,
        is_dir: metadata.is_dir(),
    })
}

fn detect_language_from_filename(path: &Path) -> String {
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

fn detect_language_from_content(content: &str) -> String {
    if content.contains("fn ") && content.contains("impl ") {
        "rust".to_string()
    } else if content.contains("function ") && content.contains("const ") {
        "javascript".to_string()
    } else if content.contains("def ") && content.contains("class ") {
        "python".to_string()
    } else if content.contains("<html") || content.contains("<div") {
        "html".to_string()
    } else if content.contains("{") && content.contains("}") {
        "json".to_string()
    } else {
        "text".to_string()
    }
}

fn format_json(content: &str) -> Result<String, NoteforgeError> {
    let value: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| NoteforgeError::InvalidInput(format!("Invalid JSON: {}", e)))?;

    serde_json::to_string_pretty(&value).map_err(|e| NoteforgeError::Internal(e.to_string()))
}
