use rusqlite::Connection;
use crate::error::NoteforgeError;
use crate::models::{Link, Backlink};

pub struct LinkRepo<'a> {
    conn: &'a Connection,
}

impl<'a> LinkRepo<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn create(
        &self,
        id: &str,
        workspace_id: &str,
        source_file: &str,
        target_file: &str,
        link_type: &str,
        context: Option<&str>,
    ) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "INSERT INTO links (id, workspace_id, source_file, target_file, link_type, context) VALUES (?, ?, ?, ?, ?, ?)",
            rusqlite::params![id, workspace_id, source_file, target_file, link_type, context],
        )?;
        Ok(())
    }

    pub fn delete_by_workspace_and_source(
        &self,
        workspace_id: &str,
        source_file: &str,
    ) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "DELETE FROM links WHERE workspace_id = ? AND source_file = ?",
            rusqlite::params![workspace_id, source_file],
        )?;
        Ok(())
    }

    pub fn get_backlinks(
        &self,
        workspace_id: &str,
        target_file: &str,
    ) -> Result<Vec<Backlink>, NoteforgeError> {
        let mut stmt = self.conn.prepare(
            "SELECT source_file, context FROM links WHERE workspace_id = ? AND target_file = ?"
        )?;
        let backlinks = stmt
            .query_map(rusqlite::params![workspace_id, target_file], |row| {
                Ok(Backlink {
                    source_file: row.get(0)?,
                    context: row.get(1)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(backlinks)
    }

    pub fn get_links_for_workspace(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<Link>, NoteforgeError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, source_file, target_file, link_type, context, created_at FROM links WHERE workspace_id = ?"
        )?;
        let links = stmt
            .query_map(rusqlite::params![workspace_id], |row| {
                Ok(Link {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    source_file: row.get(2)?,
                    target_file: row.get(3)?,
                    link_type: row.get(4)?,
                    context: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(links)
    }
}
