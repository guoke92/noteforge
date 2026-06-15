use tauri::State;
use crate::db::Database;
use crate::error::NoteforgeError;
use crate::knowledge::KnowledgeEngine;
use crate::vector::VectorEngine;
use crate::models::{
    IndexKnowledgeBaseRequest, SearchFulltextRequest, GetKnowledgeGraphRequest,
    ExtractLinksRequest, ExtractTagsRequest, GetBacklinksRequest, SemanticSearchRequest,
    SearchResult, KnowledgeGraph, GraphNode, GraphEdge, Link, Backlink,
};
use crate::pipeline::IndexPipeline;
use std::path::Path;

#[tauri::command]
pub fn index_knowledge_base(
    request: IndexKnowledgeBaseRequest,
    db: State<Database>,
) -> Result<usize, NoteforgeError> {
    let path = Path::new(&request.path);
    if !path.exists() {
        return Err(NoteforgeError::NotFound("Path not found".to_string()));
    }

    let conn = db.conn.lock().unwrap();
    let pipeline = IndexPipeline::new(&conn);

    let mut indexed = 0;

    for entry in walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            let file_path = entry.path();
            if let Some(ext) = file_path.extension() {
                if ext == "md" || ext == "txt" || ext == "json" || ext == "yaml" || ext == "yml" {
                    if let Ok(content) = std::fs::read_to_string(file_path) {
                        let title = file_path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Untitled")
                            .to_string();

                        let relative_path = file_path
                            .strip_prefix(path)
                            .unwrap_or(file_path)
                            .to_string_lossy()
                            .to_string();

                        if pipeline
                            .index_document(
                                &request.workspace_id,
                                &relative_path,
                                &title,
                                &content,
                            )
                            .is_ok()
                        {
                            indexed += 1;
                        }
                    }
                }
            }
        }
    }

    Ok(indexed)
}

#[tauri::command]
pub fn search_fulltext(
    request: SearchFulltextRequest,
    db: State<Database>,
) -> Result<Vec<SearchResult>, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let engine = KnowledgeEngine::new(&conn)?;

    let limit = request.limit.unwrap_or(10);
    let results = engine.search(&request.query, limit)?;

    // Filter by workspace: only return results whose file_path belongs to workspace notes
    let note_repo = crate::repositories::NoteRepo::new(&conn);
    let file_paths = note_repo.get_file_paths(&request.workspace_id)?;

    let filtered: Vec<SearchResult> = results
        .into_iter()
        .filter(|r| file_paths.contains(&r.file_path))
        .take(limit)
        .collect();

    Ok(filtered)
}

#[tauri::command]
pub fn get_knowledge_graph(
    request: GetKnowledgeGraphRequest,
    db: State<Database>,
) -> Result<KnowledgeGraph, NoteforgeError> {
    let conn = db.conn.lock().unwrap();

    // Get nodes for workspace
    let mut stmt = conn.prepare(
        "SELECT id, node_type, reference_id, properties FROM graph_nodes gn
         WHERE EXISTS (SELECT 1 FROM graph_edges ge WHERE ge.source_node_id = gn.id OR ge.target_node_id = gn.id)
         AND properties LIKE ?",
    )?;
    let workspace_pattern = format!("\"workspace_id\":\"{}\"", request.workspace_id);
    let nodes: Vec<GraphNode> = stmt
        .query_map(rusqlite::params![workspace_pattern], |row| {
            let id: String = row.get(0)?;
            let node_type: String = row.get(1)?;
            let reference_id: String = row.get(2)?;
            let properties_json: String = row.get(3)?;
            let properties: serde_json::Value =
                serde_json::from_str(&properties_json).unwrap_or(serde_json::Value::Null);
            Ok(GraphNode {
                id,
                node_type,
                reference_id,
                properties,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    let node_ids: Vec<String> = nodes.iter().map(|n| n.id.clone()).collect();

    // Get edges between these nodes
    let mut edges = Vec::new();
    for node_id in &node_ids {
        let mut stmt = conn.prepare(
            "SELECT id, source_node_id, target_node_id, edge_type, weight, properties FROM graph_edges WHERE source_node_id = ? OR target_node_id = ?"
        )?;
        let node_edges: Vec<GraphEdge> = stmt
            .query_map(rusqlite::params![node_id, node_id], |row| {
                let id: String = row.get(0)?;
                let source_node_id: String = row.get(1)?;
                let target_node_id: String = row.get(2)?;
                let edge_type: String = row.get(3)?;
                let weight: f64 = row.get(4)?;
                let properties_json: String = row.get(5)?;
                let properties: serde_json::Value =
                    serde_json::from_str(&properties_json).unwrap_or(serde_json::Value::Null);
                Ok(GraphEdge {
                    id,
                    source_node_id,
                    target_node_id,
                    edge_type,
                    weight,
                    properties,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        edges.extend(node_edges);
    }

    // Deduplicate edges
    edges.sort_by(|a, b| a.id.cmp(&b.id));
    edges.dedup_by(|a, b| a.id == b.id);

    Ok(KnowledgeGraph { nodes, edges })
}

#[tauri::command]
pub fn extract_links(request: ExtractLinksRequest) -> Result<Vec<Link>, NoteforgeError> {
    let mut links = Vec::new();

    // Extract [[wiki-links]]
    let wiki_link_regex = regex::Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
    for cap in wiki_link_regex.captures_iter(&request.content) {
        if let Some(target) = cap.get(1) {
            links.push(Link {
                id: uuid::Uuid::new_v4().to_string(),
                workspace_id: String::new(),
                source_file: request.file_path.clone(),
                target_file: target.as_str().to_string(),
                link_type: "reference".to_string(),
                context: Some(cap.get(0).unwrap().as_str().to_string()),
                created_at: String::new(),
            });
        }
    }

    // Extract [markdown](links)
    let markdown_link_regex = regex::Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").unwrap();
    for cap in markdown_link_regex.captures_iter(&request.content) {
        if let Some(target) = cap.get(2) {
            links.push(Link {
                id: uuid::Uuid::new_v4().to_string(),
                workspace_id: String::new(),
                source_file: request.file_path.clone(),
                target_file: target.as_str().to_string(),
                link_type: "reference".to_string(),
                context: Some(cap.get(0).unwrap().as_str().to_string()),
                created_at: String::new(),
            });
        }
    }

    Ok(links)
}

#[tauri::command]
pub fn extract_tags(request: ExtractTagsRequest) -> Result<Vec<String>, NoteforgeError> {
    Ok(extract_tags_from_content(&request.content))
}

#[tauri::command]
pub fn get_backlinks(
    request: GetBacklinksRequest,
    db: State<Database>,
) -> Result<Vec<Backlink>, NoteforgeError> {
    let conn = db.conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT source_file, context FROM links WHERE target_file = ?"
    )?;
    let backlinks: Vec<Backlink> = stmt
        .query_map(rusqlite::params![request.file_path], |row| {
            Ok(Backlink {
                source_file: row.get(0)?,
                context: row.get(1)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(backlinks)
}

#[tauri::command]
pub fn semantic_search(
    request: SemanticSearchRequest,
    db: State<Database>,
) -> Result<Vec<SearchResult>, NoteforgeError> {
    let conn = db.conn.lock().unwrap();
    let vector_engine = VectorEngine::new(&conn)?;

    let limit = request.limit.unwrap_or(10);
    let results = vector_engine.search_similar(&request.query, Some("note"), limit)?;

    // JOIN with notes to get title and content
    let mut search_results = Vec::new();
    for r in results {
        let mut stmt = conn.prepare(
            "SELECT title, content FROM notes WHERE file_path = ? AND workspace_id = ?"
        )?;
        let note_info = stmt
            .query_row(rusqlite::params![r.document_id, request.workspace_id], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                ))
            })
            .ok();

        if let Some((title, content)) = note_info {
            search_results.push(SearchResult {
                file_path: r.document_id,
                title,
                content,
                score: r.score as f32,
            });
        }
    }

    Ok(search_results)
}

fn extract_tags_from_content(content: &str) -> Vec<String> {
    let mut tags = Vec::new();

    // Extract #tags
    let tag_regex = regex::Regex::new(r"#(\w+)").unwrap();
    for cap in tag_regex.captures_iter(content) {
        if let Some(tag) = cap.get(1) {
            tags.push(tag.as_str().to_string());
        }
    }

    // Extract YAML frontmatter tags
    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let frontmatter = &content[3..3 + end];
            let tags_regex =
                regex::Regex::new(r"tags:\s*\n((?:\s*-\s*(\w+)\n?)+)").unwrap();
            if let Some(caps) = tags_regex.captures(frontmatter) {
                if let Some(tags_list) = caps.get(1) {
                    for tag in tags_list.as_str().lines() {
                        let tag = tag.trim().trim_start_matches('-').trim();
                        if !tag.is_empty() {
                            tags.push(tag.to_string());
                        }
                    }
                }
            }
        }
    }

    tags.sort();
    tags.dedup();
    tags
}
