use tauri::State;
use crate::db::Database;
use crate::error::NoteforgeError;
use crate::models::{
    GetTagsRequest, FilterByTagsRequest, GetTimelineRequest, TagCount, FileEntry, TimelineEntry,
};

#[tauri::command]
pub fn get_tags(
    request: GetTagsRequest,
    db: State<Database>,
) -> Result<Vec<TagCount>, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let tag_repo = crate::repositories::TagRepo::new(&conn);
    tag_repo.get_tag_counts_for_workspace(&request.workspace_id)
}

#[tauri::command]
pub fn filter_by_tags(
    request: FilterByTagsRequest,
    db: State<Database>,
) -> Result<Vec<FileEntry>, NoteforgeError> {
    let conn = db.conn.lock().unwrap();

    if request.tags.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders: Vec<String> = request.tags.iter().map(|_| "?".to_string()).collect();
    let query = format!(
        "SELECT DISTINCT n.file_path, n.title
         FROM notes n
         INNER JOIN note_tags nt ON n.id = nt.note_id
         INNER JOIN tags t ON nt.tag_id = t.id
         WHERE n.workspace_id = ? AND t.name IN ({})",
        placeholders.join(", ")
    );

    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> =
        vec![Box::new(request.workspace_id.clone())];
    for tag in &request.tags {
        params.push(Box::new(tag.clone()));
    }

    let mut stmt = conn.prepare(&query)?;
    let files: Vec<FileEntry> = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            let path: String = row.get(0)?;
            let _title: String = row.get(1)?;
            let name = std::path::Path::new(&path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();

            Ok(FileEntry {
                name,
                path,
                is_dir: false,
                size: 0,
                modified: String::new(),
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(files)
}

#[tauri::command]
pub fn get_timeline(
    request: GetTimelineRequest,
    db: State<Database>,
) -> Result<Vec<TimelineEntry>, NoteforgeError> {
    let conn = db.conn.lock().unwrap();

    let mut query =
        "SELECT id, title, content, created_at, updated_at FROM notes WHERE workspace_id = ?"
            .to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> =
        vec![Box::new(request.workspace_id.clone())];

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
    let entries: Vec<TimelineEntry> = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let content: String = row.get(2)?;
            let created_at: String = row.get(3)?;
            let updated_at: String = row.get(4)?;

            Ok(TimelineEntry {
                id,
                title,
                content,
                created_at,
                updated_at,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}
