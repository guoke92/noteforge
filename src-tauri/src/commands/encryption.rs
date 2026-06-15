use std::path::Path;
use tauri::State;
use crate::db::Database;
use crate::error::NoteforgeError;
use crate::encryption::EncryptionService;
use crate::models::{
    EncryptBackupRequest, DecryptBackupRequest, StoreApiKeyRequest, RetrieveApiKeyRequest,
    EncryptBackupResponse, DecryptBackupResponse, RetrieveApiKeyResponse,
};

#[tauri::command]
pub fn encrypt_backup(
    request: EncryptBackupRequest,
    db: State<Database>,
) -> Result<EncryptBackupResponse, NoteforgeError> {
    let conn = db.conn.lock().unwrap();

    let mut stmt = conn.prepare("SELECT path FROM workspaces WHERE id = ?")?;
    let workspace_path: String = stmt
        .query_row(rusqlite::params![request.workspace_id], |row| {
            let path: String = row.get(0)?;
            Ok(path)
        })
        .map_err(|_| NoteforgeError::NotFound("Workspace not found".to_string()))?;

    let encryption_service = EncryptionService::new();
    let backup_path = encryption_service.create_backup(
        Path::new(&workspace_path),
        &request.password,
        Path::new(&request.output_path),
    )?;

    Ok(EncryptBackupResponse { backup_path })
}

#[tauri::command]
pub fn decrypt_backup(
    request: DecryptBackupRequest,
) -> Result<DecryptBackupResponse, NoteforgeError> {
    let encryption_service = EncryptionService::new();
    let restored = encryption_service.restore_backup(
        Path::new(&request.backup_path),
        &request.password,
        Path::new(&request.output_path),
    )?;

    Ok(DecryptBackupResponse { restored })
}

#[tauri::command]
pub fn store_api_key(request: StoreApiKeyRequest) -> Result<(), NoteforgeError> {
    let encryption_service = EncryptionService::new();
    encryption_service.store_api_key(&request.service, &request.key, &request.password)
}

#[tauri::command]
pub fn retrieve_api_key(
    request: RetrieveApiKeyRequest,
) -> Result<RetrieveApiKeyResponse, NoteforgeError> {
    let encryption_service = EncryptionService::new();
    let key = encryption_service.retrieve_api_key(&request.service, &request.password)?;
    Ok(RetrieveApiKeyResponse { key })
}
