use rusqlite::Connection;
use crate::error::NoteforgeError;

pub struct EmbeddingRepo<'a> {
    conn: &'a Connection,
}

impl<'a> EmbeddingRepo<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn upsert(
        &self,
        document_id: &str,
        document_type: &str,
        embedding_json: &str,
    ) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO document_embeddings (document_id, document_type, embedding) VALUES (?, ?, ?)",
            rusqlite::params![document_id, document_type, embedding_json],
        )?;
        Ok(())
    }

    pub fn find_all(
        &self,
        document_type: Option<&str>,
    ) -> Result<Vec<(String, String, String)>, NoteforgeError> {
        let results = if let Some(doc_type) = document_type {
            let mut stmt = self.conn.prepare(
                "SELECT document_id, document_type, embedding FROM document_embeddings WHERE document_type = ?"
            )?;
            let rows: Vec<(String, String, String)> = stmt
                .query_map(rusqlite::params![doc_type], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })?
                .filter_map(|r| r.ok())
                .collect();
            rows
        } else {
            let mut stmt = self.conn.prepare(
                "SELECT document_id, document_type, embedding FROM document_embeddings"
            )?;
            let rows: Vec<(String, String, String)> = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })?
                .filter_map(|r| r.ok())
                .collect();
            rows
        };
        Ok(results)
    }

    pub fn delete(&self, document_id: &str) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "DELETE FROM document_embeddings WHERE document_id = ?",
            rusqlite::params![document_id],
        )?;
        Ok(())
    }
}
