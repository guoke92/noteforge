use tauri::State;
use crate::db::Database;
use crate::error::NoteforgeError;
use crate::models::{
    CreateMemoryRequest, DeleteMemoryRequest, BatchTagMemoriesRequest,
    BatchDeleteMemoriesRequest, ListAgentMemoriesRequest, GetMemoryTimelineRequest,
    MonitorMemoryDirectoryRequest, ImportAgentMemoriesRequest, ImportAgentMemoriesResponse,
    MemoryEntry, Agent,
};
use crate::repositories::TagRepo;

#[tauri::command]
pub fn monitor_memory_directory(
    request: MonitorMemoryDirectoryRequest,
    db: State<Database>,
) -> Result<String, NoteforgeError> {
    let watcher_id = uuid::Uuid::new_v4().to_string();

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO file_watchers (id, workspace_id, path, is_active) VALUES (?, '', ?, TRUE)",
        rusqlite::params![watcher_id, request.path],
    )?;

    Ok(watcher_id)
}

#[tauri::command]
pub fn list_agent_memories(
    request: ListAgentMemoriesRequest,
    db: State<Database>,
) -> Result<Vec<MemoryEntry>, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let tag_repo = TagRepo::new(&conn);

    let (query, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) =
        if let Some(r#type) = &request.r#type {
            (
                "SELECT id, agent_id, content, title, type, importance, last_accessed, access_count, created_at, updated_at, metadata FROM memories WHERE agent_id = ? AND type = ? ORDER BY created_at DESC".to_string(),
                vec![Box::new(request.agent_id.clone()), Box::new(r#type.clone())],
            )
        } else {
            (
                "SELECT id, agent_id, content, title, type, importance, last_accessed, access_count, created_at, updated_at, metadata FROM memories WHERE agent_id = ? ORDER BY created_at DESC".to_string(),
                vec![Box::new(request.agent_id.clone())],
            )
        };

    let mut stmt = conn.prepare(&query)?;
    let memories: Vec<MemoryEntry> = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            let id: String = row.get(0)?;
            let agent_id: String = row.get(1)?;
            let content: String = row.get(2)?;
            let title: Option<String> = row.get(3)?;
            let r#type: String = row.get(4)?;
            let importance: f64 = row.get(5)?;
            let last_accessed: Option<String> = row.get(6)?;
            let access_count: i32 = row.get(7)?;
            let created_at: String = row.get(8)?;
            let updated_at: String = row.get(9)?;
            let metadata_json: Option<String> = row.get(10)?;
            let metadata: Option<serde_json::Value> =
                metadata_json.and_then(|s| serde_json::from_str(&s).ok());

            Ok(MemoryEntry {
                id,
                agent_id,
                content,
                title,
                r#type,
                importance,
                last_accessed,
                access_count,
                created_at,
                updated_at,
                metadata,
                tags: vec![],
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Enrich with tags
    let mut result = Vec::new();
    for mut mem in memories {
        mem.tags = tag_repo.get_tags_for_memory(&mem.id)?;
        result.push(mem);
    }

    Ok(result)
}

#[tauri::command]
pub fn list_agents(db: State<Database>) -> Result<Vec<Agent>, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT agent_id, COUNT(*) as memory_count FROM memories GROUP BY agent_id ORDER BY agent_id"
    )?;
    let agents = stmt
        .query_map([], |row| {
            Ok(Agent {
                id: row.get(0)?,
                name: row.get::<_, String>(0)?,
                r#type: "assistant".to_string(),
                memory_count: row.get(1)?,
                color: None,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(agents)
}

#[tauri::command]
pub fn get_memory_timeline(
    request: GetMemoryTimelineRequest,
    db: State<Database>,
) -> Result<Vec<MemoryEntry>, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let tag_repo = TagRepo::new(&conn);

    let mut query = "SELECT id, agent_id, content, title, type, importance, last_accessed, access_count, created_at, updated_at, metadata FROM memories WHERE agent_id = ?".to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> =
        vec![Box::new(request.agent_id.clone())];

    if let Some(start_date) = &request.start_date {
        query.push_str(" AND created_at >= ?");
        params.push(Box::new(start_date.clone()));
    }

    if let Some(end_date) = &request.end_date {
        query.push_str(" AND created_at <= ?");
        params.push(Box::new(end_date.clone()));
    }

    query.push_str(" ORDER BY created_at DESC");

    let mut stmt = conn.prepare(&query)?;
    let memories: Vec<MemoryEntry> = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            let id: String = row.get(0)?;
            let agent_id: String = row.get(1)?;
            let content: String = row.get(2)?;
            let title: Option<String> = row.get(3)?;
            let r#type: String = row.get(4)?;
            let importance: f64 = row.get(5)?;
            let last_accessed: Option<String> = row.get(6)?;
            let access_count: i32 = row.get(7)?;
            let created_at: String = row.get(8)?;
            let updated_at: String = row.get(9)?;
            let metadata_json: Option<String> = row.get(10)?;
            let metadata: Option<serde_json::Value> =
                metadata_json.and_then(|s| serde_json::from_str(&s).ok());

            Ok(MemoryEntry {
                id,
                agent_id,
                content,
                title,
                r#type,
                importance,
                last_accessed,
                access_count,
                created_at,
                updated_at,
                metadata,
                tags: vec![],
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut result = Vec::new();
    for mut mem in memories {
        mem.tags = tag_repo.get_tags_for_memory(&mem.id)?;
        result.push(mem);
    }

    Ok(result)
}

#[tauri::command]
pub fn update_memory(
    request: crate::models::UpdateMemoryRequest,
    db: State<Database>,
) -> Result<(), NoteforgeError> {
    let conn = db.conn.lock().unwrap();

    if let Some(content) = &request.content {
        conn.execute(
            "UPDATE memories SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            rusqlite::params![content, request.memory_id],
        )?;
    }

    if let Some(title) = &request.title {
        conn.execute(
            "UPDATE memories SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            rusqlite::params![title, request.memory_id],
        )?;
    }

    if let Some(metadata) = &request.metadata {
        let metadata_json = serde_json::to_string(metadata)?;
        conn.execute(
            "UPDATE memories SET metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            rusqlite::params![metadata_json, request.memory_id],
        )?;
    }

    Ok(())
}

#[tauri::command]
pub fn create_memory(
    request: CreateMemoryRequest,
    db: State<Database>,
) -> Result<String, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let tag_repo = TagRepo::new(&conn);
    let id = uuid::Uuid::new_v4().to_string();

    let metadata_json = request
        .metadata
        .map(|m| serde_json::to_string(&m).unwrap_or_default());

    conn.execute(
        "INSERT INTO memories (id, workspace_id, agent_id, content, title, type, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            id,
            request.workspace_id,
            request.agent_id,
            request.content,
            request.title,
            request.r#type,
            metadata_json
        ],
    )?;

    // Attach tags
    if let Some(tags) = &request.tags {
        for tag_name in tags {
            let tag_id = tag_repo.get_or_create(tag_name)?;
            tag_repo.link_memory(&id, &tag_id)?;
        }
    }

    Ok(id)
}

#[tauri::command]
pub fn delete_memory(
    request: DeleteMemoryRequest,
    db: State<Database>,
) -> Result<(), NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "DELETE FROM memories WHERE id = ?",
        rusqlite::params![request.memory_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn batch_tag_memories(
    request: BatchTagMemoriesRequest,
    db: State<Database>,
) -> Result<(), NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let tag_repo = TagRepo::new(&conn);

    for memory_id in &request.memory_ids {
        for tag_name in &request.tags {
            let tag_id = tag_repo.get_or_create(tag_name)?;
            tag_repo.link_memory(memory_id, &tag_id)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn batch_delete_memories(
    request: BatchDeleteMemoriesRequest,
    db: State<Database>,
) -> Result<(), NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    for memory_id in &request.memory_ids {
        conn.execute(
            "DELETE FROM memories WHERE id = ?",
            rusqlite::params![memory_id],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn import_agent_memories(
    request: ImportAgentMemoriesRequest,
    db: State<Database>,
) -> Result<ImportAgentMemoriesResponse, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let mut imported = 0;
    let mut errors = Vec::new();

    match request.format.as_str() {
        "json" => {
            let data: Vec<serde_json::Value> = serde_json::from_str(&request.data)
                .map_err(|e| NoteforgeError::InvalidInput(format!("Invalid JSON: {}", e)))?;

            for item in data {
                let content = item["content"].as_str().unwrap_or("");
                let r#type = item["type"].as_str().unwrap_or("fact");
                let title = item["title"].as_str().map(|s| s.to_string());
                let metadata = item.get("metadata").cloned();
                let metadata_json =
                    metadata.map(|m| serde_json::to_string(&m).unwrap_or_default());

                let id = uuid::Uuid::new_v4().to_string();
                match conn.execute(
                    "INSERT INTO memories (id, workspace_id, agent_id, content, title, type, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    rusqlite::params![id, request.workspace_id, request.agent_id, content, title, r#type, metadata_json],
                ) {
                    Ok(_) => imported += 1,
                    Err(e) => errors.push(e.to_string()),
                }
            }
        }
        _ => {
            errors.push(format!("Unsupported format: {}", request.format));
        }
    }

    Ok(ImportAgentMemoriesResponse { imported, errors })
}
