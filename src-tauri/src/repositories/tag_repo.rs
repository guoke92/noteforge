use rusqlite::Connection;
use crate::error::NoteforgeError;
use crate::models::TagCount;

pub struct TagRepo<'a> {
    conn: &'a Connection,
}

impl<'a> TagRepo<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn get_or_create(&self, name: &str) -> Result<String, NoteforgeError> {
        let mut stmt = self.conn.prepare("SELECT id FROM tags WHERE name = ?")?;
        let existing = stmt.query_row(rusqlite::params![name], |row| {
            let id: String = row.get(0)?;
            Ok(id)
        });

        match existing {
            Ok(id) => Ok(id),
            Err(_) => {
                let id = uuid::Uuid::new_v4().to_string();
                self.conn.execute(
                    "INSERT INTO tags (id, name) VALUES (?, ?)",
                    rusqlite::params![id, name],
                )?;
                Ok(id)
            }
        }
    }

    pub fn link_note(&self, note_id: &str, tag_id: &str) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
            rusqlite::params![note_id, tag_id],
        )?;
        Ok(())
    }

    pub fn link_memory(&self, memory_id: &str, tag_id: &str) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "INSERT OR IGNORE INTO memory_tags (memory_id, tag_id) VALUES (?, ?)",
            rusqlite::params![memory_id, tag_id],
        )?;
        Ok(())
    }

    pub fn unlink_note(&self, note_id: &str, tag_id: &str) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?",
            rusqlite::params![note_id, tag_id],
        )?;
        Ok(())
    }

    pub fn unlink_memory(&self, memory_id: &str, tag_id: &str) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "DELETE FROM memory_tags WHERE memory_id = ? AND tag_id = ?",
            rusqlite::params![memory_id, tag_id],
        )?;
        Ok(())
    }

    pub fn get_tags_for_note(&self, note_id: &str) -> Result<Vec<String>, NoteforgeError> {
        let mut stmt = self.conn.prepare(
            "SELECT t.name FROM tags t INNER JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = ?"
        )?;
        let tags = stmt
            .query_map(rusqlite::params![note_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(tags)
    }

    pub fn get_tags_for_memory(&self, memory_id: &str) -> Result<Vec<String>, NoteforgeError> {
        let mut stmt = self.conn.prepare(
            "SELECT t.name FROM tags t INNER JOIN memory_tags mt ON t.id = mt.tag_id WHERE mt.memory_id = ?"
        )?;
        let tags = stmt
            .query_map(rusqlite::params![memory_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(tags)
    }

    pub fn get_tag_counts_for_workspace(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<TagCount>, NoteforgeError> {
        let mut stmt = self.conn.prepare(
            "SELECT t.name, COUNT(nt.note_id) as count
             FROM tags t
             LEFT JOIN note_tags nt ON t.id = nt.tag_id
             LEFT JOIN notes n ON nt.note_id = n.id
             WHERE n.workspace_id = ?
             GROUP BY t.id, t.name
             ORDER BY count DESC",
        )?;
        let tags = stmt
            .query_map(rusqlite::params![workspace_id], |row| {
                Ok(TagCount {
                    tag: row.get(0)?,
                    count: row.get(1)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(tags)
    }

    pub fn find_by_name(&self, name: &str) -> Result<Option<String>, NoteforgeError> {
        let mut stmt = self.conn.prepare("SELECT id FROM tags WHERE name = ?")?;
        let result = stmt
            .query_row(rusqlite::params![name], |row| row.get(0))
            .ok();
        Ok(result)
    }
}
