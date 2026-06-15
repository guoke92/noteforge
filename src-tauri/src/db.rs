use rusqlite::Connection;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;
use crate::error::NoteforgeError;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(conn: Connection) -> Self {
        Self {
            conn: Mutex::new(conn),
        }
    }
    
    pub fn init_schema(&self) -> Result<(), NoteforgeError> {
        let conn = self.conn.lock().unwrap();
        
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                config JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                title TEXT,
                content TEXT,
                language TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
                UNIQUE(workspace_id, file_path)
            );
            
            CREATE INDEX IF NOT EXISTS idx_notes_workspace ON notes(workspace_id);
            CREATE INDEX IF NOT EXISTS idx_notes_file_path ON notes(workspace_id, file_path);
            
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                content TEXT NOT NULL,
                title TEXT,
                type TEXT CHECK(type IN ('conversation', 'fact', 'procedure', 'context')) NOT NULL,
                importance REAL DEFAULT 0.5,
                last_accessed TIMESTAMP,
                access_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata JSON,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            
            CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id);
            CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
            CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
            CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
            
            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS note_tags (
                note_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                PRIMARY KEY (note_id, tag_id),
                FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS memory_tags (
                memory_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                PRIMARY KEY (memory_id, tag_id),
                FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS links (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                source_file TEXT NOT NULL,
                target_file TEXT NOT NULL,
                link_type TEXT CHECK(link_type IN ('reference', 'embed', 'custom')) DEFAULT 'reference',
                context TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            
            CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_file);
            CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_file);
            
            CREATE TABLE IF NOT EXISTS graph_nodes (
                id TEXT PRIMARY KEY,
                node_type TEXT CHECK(node_type IN ('note', 'memory', 'concept', 'agent')) NOT NULL,
                reference_id TEXT NOT NULL,
                properties JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS graph_edges (
                id TEXT PRIMARY KEY,
                source_node_id TEXT NOT NULL,
                target_node_id TEXT NOT NULL,
                edge_type TEXT NOT NULL,
                weight REAL DEFAULT 1.0,
                properties JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_node_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
                FOREIGN KEY (target_node_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
            );
            
            CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_node_id);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_node_id);
            
            CREATE TABLE IF NOT EXISTS file_watchers (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                path TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS search_history (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                query TEXT NOT NULL,
                type TEXT CHECK(type IN ('fulltext', 'semantic', 'graph')) NOT NULL,
                result_count INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS ai_logs (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                model TEXT,
                input_tokens INTEGER,
                output_tokens INTEGER,
                duration_ms INTEGER,
                success BOOLEAN,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            
            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                value JSON NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        ")?;
        
        Ok(())
    }
}

pub fn init_database(app: &AppHandle) -> Result<(), NoteforgeError> {
    let app_dir = app.path().app_data_dir().map_err(|e| NoteforgeError::Internal(e.to_string()))?;
    std::fs::create_dir_all(&app_dir).map_err(|e| NoteforgeError::Internal(e.to_string()))?;
    
    let db_path = app_dir.join("noteforge.db");
    let conn = Connection::open(db_path)?;
    
    let db = Database::new(conn);
    db.init_schema()?;
    
    app.manage(db);
    
    Ok(())
}