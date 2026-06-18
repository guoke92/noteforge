use rusqlite::Connection;
use crate::error::NoteforgeError;
use crate::models::NoteView;

pub struct NoteRepo<'a> {
    conn: &'a Connection,
}

impl<'a> NoteRepo<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn create(
        &self,
        id: &str,
        workspace_id: &str,
        file_path: &str,
        title: Option<&str>,
        content: Option<&str>,
        language: Option<&str>,
    ) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "INSERT INTO notes (id, workspace_id, file_path, title, content, language) VALUES (?, ?, ?, ?, ?, ?)",
            rusqlite::params![id, workspace_id, file_path, title, content, language],
        )?;
        Ok(())
    }

    pub fn upsert(
        &self,
        id: &str,
        workspace_id: &str,
        file_path: &str,
        title: Option<&str>,
        content: Option<&str>,
        language: Option<&str>,
        disk_mtime: i64,
        disk_size: i64,
    ) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "INSERT INTO notes (id, workspace_id, file_path, title, content, language, disk_mtime, disk_size)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(workspace_id, file_path) DO UPDATE SET
               title = excluded.title,
               content = excluded.content,
               language = excluded.language,
               disk_mtime = excluded.disk_mtime,
               disk_size = excluded.disk_size,
               updated_at = CURRENT_TIMESTAMP",
            rusqlite::params![
                id,
                workspace_id,
                file_path,
                title,
                content,
                language,
                disk_mtime,
                disk_size
            ],
        )?;
        Ok(())
    }

    /// Cached disk revision per indexed file — used for incremental re-index.
    pub fn get_disk_meta_map(
        &self,
        workspace_id: &str,
    ) -> Result<std::collections::HashMap<String, (i64, i64)>, NoteforgeError> {
        let mut stmt = self.conn.prepare(
            "SELECT file_path, disk_mtime, disk_size FROM notes
             WHERE workspace_id = ? AND disk_mtime IS NOT NULL AND disk_size IS NOT NULL",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![workspace_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
            })?
            .filter_map(|r| r.ok());
        Ok(rows.map(|(path, mtime, size)| (path, (mtime, size))).collect())
    }

    pub fn find_by_id(&self, id: &str) -> Result<Option<NoteView>, NoteforgeError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, file_path, title, content, language, created_at, updated_at FROM notes WHERE id = ?"
        )?;
        let result = stmt
            .query_row(rusqlite::params![id], |row| {
                Ok(NoteView {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    file_path: row.get(2)?,
                    title: row.get(3)?,
                    content: row.get(4)?,
                    language: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .ok();
        Ok(result)
    }

    pub fn find_by_workspace_and_path(
        &self,
        workspace_id: &str,
        file_path: &str,
    ) -> Result<Option<NoteView>, NoteforgeError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, file_path, title, content, language, created_at, updated_at FROM notes WHERE workspace_id = ? AND file_path = ?"
        )?;
        let result = stmt
            .query_row(rusqlite::params![workspace_id, file_path], |row| {
                Ok(NoteView {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    file_path: row.get(2)?,
                    title: row.get(3)?,
                    content: row.get(4)?,
                    language: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .ok();
        Ok(result)
    }

    pub fn list_by_workspace(&self, workspace_id: &str) -> Result<Vec<NoteView>, NoteforgeError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, file_path, title, content, language, created_at, updated_at FROM notes WHERE workspace_id = ? ORDER BY updated_at DESC"
        )?;
        let notes = stmt
            .query_map(rusqlite::params![workspace_id], |row| {
                Ok(NoteView {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    file_path: row.get(2)?,
                    title: row.get(3)?,
                    content: row.get(4)?,
                    language: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(notes)
    }

    pub fn update(
        &self,
        id: &str,
        title: Option<&str>,
        content: Option<&str>,
    ) -> Result<(), NoteforgeError> {
        if let Some(t) = title {
            self.conn.execute(
                "UPDATE notes SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                rusqlite::params![t, id],
            )?;
        }
        if let Some(c) = content {
            self.conn.execute(
                "UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                rusqlite::params![c, id],
            )?;
        }
        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<(), NoteforgeError> {
        self.conn
            .execute("DELETE FROM notes WHERE id = ?", rusqlite::params![id])?;
        Ok(())
    }

    pub fn delete_by_workspace_and_path(
        &self,
        workspace_id: &str,
        file_path: &str,
    ) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "DELETE FROM notes WHERE workspace_id = ? AND file_path = ?",
            rusqlite::params![workspace_id, file_path],
        )?;
        Ok(())
    }

    pub fn get_file_paths(&self, workspace_id: &str) -> Result<Vec<String>, NoteforgeError> {
        let mut stmt = self
            .conn
            .prepare("SELECT file_path FROM notes WHERE workspace_id = ?")?;
        let paths = stmt
            .query_map(rusqlite::params![workspace_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(paths)
    }
}
