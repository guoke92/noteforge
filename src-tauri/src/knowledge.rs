use crate::error::NoteforgeError;
use crate::models::SearchResult;
use rusqlite::Connection;

pub struct KnowledgeEngine<'a> {
    conn: &'a Connection,
}

impl<'a> KnowledgeEngine<'a> {
    pub fn new(conn: &'a Connection) -> Result<Self, NoteforgeError> {
        conn.execute_batch(
            "
            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                content, 
                title, 
                file_path,
                tokenize='unicode61 remove_diacritics 2'
            );
        ",
        )?;

        Ok(Self { conn })
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>, NoteforgeError> {
        let mut stmt = self.conn.prepare(
            "SELECT file_path, title, content FROM notes_fts WHERE notes_fts MATCH ? LIMIT ?",
        )?;

        let results: Vec<SearchResult> = stmt
            .query_map(rusqlite::params![query, limit], |row| {
                let file_path: String = row.get(0)?;
                let title: String = row.get(1)?;
                let content: String = row.get(2)?;
                Ok(SearchResult {
                    file_path,
                    title,
                    content,
                    score: 1.0,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(results)
    }

    pub fn index_document(
        &self,
        file_path: &str,
        title: &str,
        content: &str,
    ) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "DELETE FROM notes_fts WHERE file_path = ?",
            rusqlite::params![file_path],
        )?;

        self.conn.execute(
            "INSERT INTO notes_fts (file_path, title, content) VALUES (?, ?, ?)",
            rusqlite::params![file_path, title, content],
        )?;

        Ok(())
    }

    pub fn remove_document(&self, file_path: &str) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "DELETE FROM notes_fts WHERE file_path = ?",
            rusqlite::params![file_path],
        )?;
        Ok(())
    }
}
