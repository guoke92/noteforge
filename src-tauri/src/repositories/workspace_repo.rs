use rusqlite::Connection;
use crate::error::NoteforgeError;
use crate::models::{WorkspaceConfig, WorkspaceView};

pub struct WorkspaceRepo<'a> {
    conn: &'a Connection,
}

impl<'a> WorkspaceRepo<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn create(
        &self,
        id: &str,
        name: &str,
        path: &str,
        config: &WorkspaceConfig,
    ) -> Result<(), NoteforgeError> {
        let config_json = serde_json::to_string(config)?;
        self.conn.execute(
            "INSERT INTO workspaces (id, name, path, config) VALUES (?, ?, ?, ?)",
            rusqlite::params![id, name, path, config_json],
        )?;
        Ok(())
    }

    pub fn find_by_path(&self, path: &str) -> Result<Option<WorkspaceView>, NoteforgeError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, path, config, created_at, updated_at FROM workspaces WHERE path = ?")?;
        let result = stmt
            .query_row(rusqlite::params![path], |row| {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let path: String = row.get(2)?;
                let config_json: String = row.get(3)?;
                let created_at: String = row.get(4)?;
                let updated_at: String = row.get(5)?;
                let config: WorkspaceConfig = serde_json::from_str(&config_json).unwrap_or(WorkspaceConfig {
                    name: name.clone(),
                    path: path.clone(),
                    auto_index: true,
                    exclude_patterns: vec![],
                });
                Ok(WorkspaceView { id, name, path, config, created_at, updated_at })
            })
            .ok();
        Ok(result)
    }

    pub fn find_by_id(&self, id: &str) -> Result<Option<WorkspaceView>, NoteforgeError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, path, config, created_at, updated_at FROM workspaces WHERE id = ?")?;
        let result = stmt
            .query_row(rusqlite::params![id], |row| {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let path: String = row.get(2)?;
                let config_json: String = row.get(3)?;
                let created_at: String = row.get(4)?;
                let updated_at: String = row.get(5)?;
                let config: WorkspaceConfig = serde_json::from_str(&config_json).unwrap_or(WorkspaceConfig {
                    name: name.clone(),
                    path: path.clone(),
                    auto_index: true,
                    exclude_patterns: vec![],
                });
                Ok(WorkspaceView { id, name, path, config, created_at, updated_at })
            })
            .ok();
        Ok(result)
    }

    pub fn list_all(&self) -> Result<Vec<WorkspaceView>, NoteforgeError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, path, config, created_at, updated_at FROM workspaces ORDER BY updated_at DESC")?;
        let workspaces = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let path: String = row.get(2)?;
                let config_json: String = row.get(3)?;
                let created_at: String = row.get(4)?;
                let updated_at: String = row.get(5)?;
                let config: WorkspaceConfig = serde_json::from_str(&config_json).unwrap_or(WorkspaceConfig {
                    name: name.clone(),
                    path: path.clone(),
                    auto_index: true,
                    exclude_patterns: vec![],
                });
                Ok(WorkspaceView { id, name, path, config, created_at, updated_at })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(workspaces)
    }

    pub fn update_config(
        &self,
        id: &str,
        name: &str,
        config: &WorkspaceConfig,
    ) -> Result<(), NoteforgeError> {
        let config_json = serde_json::to_string(config)?;
        self.conn.execute(
            "UPDATE workspaces SET name = ?, config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            rusqlite::params![name, config_json, id],
        )?;
        Ok(())
    }

    pub fn path_exists(&self, path: &str) -> Result<bool, NoteforgeError> {
        let mut stmt = self.conn.prepare("SELECT id FROM workspaces WHERE path = ?")?;
        let exists = stmt.exists(rusqlite::params![path])?;
        Ok(exists)
    }
}
