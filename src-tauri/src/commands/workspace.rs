use tauri::State;
use crate::db::Database;
use crate::error::NoteforgeError;
use crate::models::{CreateWorkspaceRequest, OpenWorkspaceRequest, WorkspaceConfig, WorkspaceView};
use crate::repositories::WorkspaceRepo;

#[tauri::command]
pub fn create_workspace(
    request: CreateWorkspaceRequest,
    db: State<Database>,
) -> Result<WorkspaceView, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let repo = WorkspaceRepo::new(&conn);

    if repo.path_exists(&request.path)? {
        return Err(NoteforgeError::InvalidInput(
            "Workspace already exists".to_string(),
        ));
    }

    std::fs::create_dir_all(&request.path).map_err(NoteforgeError::Io)?;

    let id = uuid::Uuid::new_v4().to_string();
    let config = WorkspaceConfig {
        name: request.name.clone(),
        path: request.path.clone(),
        auto_index: true,
        exclude_patterns: vec![".git".to_string(), "node_modules".to_string()],
    };

    repo.create(&id, &request.name, &request.path, &config)?;

    let workspace = repo.find_by_id(&id)?.unwrap();
    Ok(workspace)
}

#[tauri::command]
pub fn open_workspace(
    request: OpenWorkspaceRequest,
    db: State<Database>,
) -> Result<WorkspaceView, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let repo = WorkspaceRepo::new(&conn);

    if let Some(workspace) = repo.find_by_path(&request.path)? {
        return Ok(workspace);
    }

    // Drag-drop / "open folder" may target a path not yet registered in DB.
    let path = std::path::Path::new(&request.path);
    if !path.exists() {
        return Err(NoteforgeError::NotFound(
            "Workspace path not found".to_string(),
        ));
    }
    if !path.is_dir() {
        return Err(NoteforgeError::InvalidInput(
            "Workspace path must be a directory".to_string(),
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let config = WorkspaceConfig {
        name: name.clone(),
        path: request.path.clone(),
        auto_index: true,
        exclude_patterns: vec![".git".to_string(), "node_modules".to_string()],
    };

    repo.create(&id, &name, &request.path, &config)?;

    repo.find_by_id(&id)?
        .ok_or_else(|| NoteforgeError::Internal("Failed to register workspace".to_string()))
}

#[tauri::command]
pub fn list_workspaces(db: State<Database>) -> Result<Vec<WorkspaceView>, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let repo = WorkspaceRepo::new(&conn);
    repo.list_all()
}

#[tauri::command]
pub fn get_workspace_config(
    id: String,
    db: State<Database>,
) -> Result<WorkspaceConfig, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let repo = WorkspaceRepo::new(&conn);

    let workspace = repo
        .find_by_id(&id)?
        .ok_or_else(|| NoteforgeError::NotFound("Workspace not found".to_string()))?;

    Ok(workspace.config)
}

#[tauri::command]
pub fn update_workspace_config(
    id: String,
    config: WorkspaceConfig,
    db: State<Database>,
) -> Result<(), NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let repo = WorkspaceRepo::new(&conn);
    repo.update_config(&id, &config.name, &config)
}
