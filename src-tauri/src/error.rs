use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum NoteforgeError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    
    #[error("Notify error: {0}")]
    Notify(#[from] notify::Error),
    
    #[error("Reqwest error: {0}")]
    Reqwest(#[from] reqwest::Error),
    
    #[error("Encryption error: {0}")]
    Encryption(String),
    
    #[error("AI error: {0}")]
    Ai(String),
    
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    
    #[error("Internal error: {0}")]
    Internal(String),
    
    #[error("Vector search error: {0}")]
    VectorSearch(String),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
}

impl Serialize for NoteforgeError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let (code, message) = match self {
            NoteforgeError::Database(e) => ("DATABASE_ERROR", e.to_string()),
            NoteforgeError::Io(e) => ("IO_ERROR", e.to_string()),
            NoteforgeError::Json(e) => ("JSON_ERROR", e.to_string()),
            NoteforgeError::Notify(e) => ("NOTIFY_ERROR", e.to_string()),
            NoteforgeError::Reqwest(e) => ("REQWEST_ERROR", e.to_string()),
            NoteforgeError::Encryption(e) => ("ENCRYPT_ERROR", e.to_string()),
            NoteforgeError::Ai(e) => ("AI_ERROR", e.to_string()),
            NoteforgeError::NotFound(e) => ("NOT_FOUND", e.to_string()),
            NoteforgeError::InvalidInput(e) => ("INVALID_INPUT", e.to_string()),
            NoteforgeError::PermissionDenied(e) => ("PERMISSION_DENIED", e.to_string()),
            NoteforgeError::Internal(e) => ("INTERNAL_ERROR", e.to_string()),
            NoteforgeError::VectorSearch(e) => ("VECTOR_SEARCH_ERROR", e.to_string()),
        };
        
        ErrorResponse {
            code: code.to_string(),
            message,
        }.serialize(serializer)
    }
}

impl From<NoteforgeError> for String {
    fn from(err: NoteforgeError) -> Self {
        err.to_string()
    }
}