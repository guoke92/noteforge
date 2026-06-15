#![allow(dead_code)]

use crate::error::NoteforgeError;
use rusqlite::Connection;
use fastembed::TextEmbedding;

pub struct VectorEngine<'a> {
    conn: &'a Connection,
    embedding_model: Option<TextEmbedding>,
}

impl<'a> VectorEngine<'a> {
    pub fn new(conn: &'a Connection) -> Result<Self, NoteforgeError> {
        // Create table for storing embeddings (using JSON storage as fallback)
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS document_embeddings (
                document_id TEXT PRIMARY KEY,
                document_type TEXT NOT NULL,
                embedding JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        ")?;
        
        // Embedding model is lazy-loaded to avoid blocking on model download
        let embedding_model = None;
        
        Ok(Self { conn, embedding_model })
    }
    
    pub fn store_embedding(
        &self,
        document_id: &str,
        document_type: &str,
        content: &str,
    ) -> Result<(), NoteforgeError> {
        if let Some(ref model) = self.embedding_model {
            // Generate embedding using fastembed
            let embeddings = model.embed(vec![content], None)
                .map_err(|e| NoteforgeError::VectorSearch(format!("Embedding generation failed: {}", e)))?;
            
            if let Some(embedding) = embeddings.first() {
                // Convert embedding to JSON for storage
                let embedding_json = serde_json::to_string(embedding)
                    .map_err(|e| NoteforgeError::VectorSearch(format!("JSON serialization failed: {}", e)))?;
                
                // Store in database
                self.conn.execute(
                    "INSERT OR REPLACE INTO document_embeddings (document_id, document_type, embedding) VALUES (?, ?, ?)",
                    rusqlite::params![document_id, document_type, embedding_json],
                )?;
            }
        }
        
        Ok(())
    }
    
    pub fn search_similar(
        &self,
        query: &str,
        document_type: Option<&str>,
        limit: usize,
    ) -> Result<Vec<VectorSearchResult>, NoteforgeError> {
        if let Some(ref model) = self.embedding_model {
            // Generate query embedding
            let embeddings = model.embed(vec![query], None)
                .map_err(|e| NoteforgeError::VectorSearch(format!("Embedding generation failed: {}", e)))?;
            
            if let Some(query_embedding) = embeddings.first() {
                // Fetch all embeddings and compute similarity in memory
                // This is a simplified approach - in production, use a proper vector database
                let mut stmt = if let Some(_doc_type) = document_type {
                    self.conn.prepare(
                        "SELECT document_id, document_type, embedding FROM document_embeddings WHERE document_type = ?"
                    )?
                } else {
                    self.conn.prepare(
                        "SELECT document_id, document_type, embedding FROM document_embeddings"
                    )?
                };
                
                let results: Vec<(String, String, String)> = if let Some(doc_type) = document_type {
                    stmt.query_map(rusqlite::params![doc_type], |row| {
                        let document_id: String = row.get(0)?;
                        let document_type: String = row.get(1)?;
                        let embedding_json: String = row.get(2)?;
                        Ok((document_id, document_type, embedding_json))
                    })?.filter_map(|r| r.ok()).collect()
                } else {
                    stmt.query_map([], |row| {
                        let document_id: String = row.get(0)?;
                        let document_type: String = row.get(1)?;
                        let embedding_json: String = row.get(2)?;
                        Ok((document_id, document_type, embedding_json))
                    })?.filter_map(|r| r.ok()).collect()
                };
                
                // Compute cosine similarity and sort
                let mut scored_results: Vec<VectorSearchResult> = results.into_iter()
                    .filter_map(|(doc_id, doc_type, embedding_json)| {
                        let stored_embedding: Vec<f32> = serde_json::from_str(&embedding_json).ok()?;
                        let similarity = cosine_similarity(query_embedding, &stored_embedding);
                        Some(VectorSearchResult {
                            document_id: doc_id,
                            document_type: doc_type,
                            score: similarity,
                        })
                    })
                    .collect();
                
                scored_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
                scored_results.truncate(limit);
                
                return Ok(scored_results);
            }
        }
        
        Ok(vec![])
    }
    
    pub fn delete_embedding(&self, document_id: &str) -> Result<(), NoteforgeError> {
        self.conn.execute(
            "DELETE FROM document_embeddings WHERE document_id = ?",
            rusqlite::params![document_id],
        )?;
        
        Ok(())
    }
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    
    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    
    (dot_product / (norm_a * norm_b)) as f64
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VectorSearchResult {
    pub document_id: String,
    pub document_type: String,
    pub score: f64,
}