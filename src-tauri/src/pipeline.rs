use rusqlite::Connection;
use crate::error::NoteforgeError;
use crate::knowledge::KnowledgeEngine;
use crate::vector::VectorEngine;
use crate::repositories::{NoteRepo, TagRepo, LinkRepo};
use regex::Regex;

pub struct IndexPipeline<'a> {
    conn: &'a Connection,
}

impl<'a> IndexPipeline<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    /// 6-step atomic index for a single document
    pub fn index_document(
        &self,
        workspace_id: &str,
        file_path: &str,
        title: &str,
        content: &str,
    ) -> Result<(), NoteforgeError> {
        // Begin transaction
        self.conn.execute_batch("BEGIN TRANSACTION")?;

        let result = || -> Result<(), NoteforgeError> {
            let note_repo = NoteRepo::new(self.conn);
            let tag_repo = TagRepo::new(self.conn);
            let link_repo = LinkRepo::new(self.conn);
            let knowledge_engine = KnowledgeEngine::new(self.conn)?;
            let vector_engine = VectorEngine::new(self.conn)?;

            let note_id = uuid::Uuid::new_v4().to_string();

            // Step 1: Upsert note record
            note_repo.upsert(
                &note_id,
                workspace_id,
                file_path,
                Some(title),
                Some(content),
                Some(detect_language(file_path)),
            )?;

            // Step 2: Update FTS index
            knowledge_engine.index_document(file_path, title, content)?;

            // Step 3: Store embedding
            let _ = vector_engine.store_embedding(file_path, "note", content);

            // Step 4: Extract and store tags
            let tags = extract_tags(content);
            for tag_name in &tags {
                let tag_id = tag_repo.get_or_create(tag_name)?;
                tag_repo.link_note(&note_id, &tag_id)?;
            }

            // Step 5: Extract and store links
            link_repo.delete_by_workspace_and_source(workspace_id, file_path)?;
            let links = extract_links(content, file_path);
            for link in &links {
                link_repo.create(
                    &link.id,
                    workspace_id,
                    &link.source_file,
                    &link.target_file,
                    &link.link_type,
                    link.context.as_deref(),
                )?;
            }

            // Step 6: Update graph nodes/edges
            self.update_graph(workspace_id, file_path, title, &links)?;

            Ok(())
        }();

        match result {
            Ok(_) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(())
            }
            Err(e) => {
                self.conn.execute_batch("ROLLBACK")?;
                Err(e)
            }
        }
    }

    pub fn remove_document(
        &self,
        workspace_id: &str,
        file_path: &str,
    ) -> Result<(), NoteforgeError> {
        // Begin transaction
        self.conn.execute_batch("BEGIN TRANSACTION")?;

        let result = || -> Result<(), NoteforgeError> {
            let note_repo = NoteRepo::new(self.conn);
            let link_repo = LinkRepo::new(self.conn);
            let knowledge_engine = KnowledgeEngine::new(self.conn)?;
            let vector_engine = VectorEngine::new(self.conn)?;

            // Remove from notes
            note_repo.delete_by_workspace_and_path(workspace_id, file_path)?;

            // Remove from FTS
            knowledge_engine.remove_document(file_path)?;

            // Remove embedding
            let _ = vector_engine.delete_embedding(file_path);

            // Remove links
            link_repo.delete_by_workspace_and_source(workspace_id, file_path)?;

            // Remove graph nodes
            self.remove_graph_nodes(file_path)?;

            Ok(())
        }();

        match result {
            Ok(_) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(())
            }
            Err(e) => {
                self.conn.execute_batch("ROLLBACK")?;
                Err(e)
            }
        }
    }

    fn update_graph(
        &self,
        workspace_id: &str,
        file_path: &str,
        title: &str,
        links: &[crate::models::Link],
    ) -> Result<(), NoteforgeError> {
        eprintln!("update_graph called with {} links for {}", links.len(), file_path);
        // Upsert source node — use INSERT OR IGNORE then UPDATE to avoid cascading FK delete on edges
        let source_node_id = format!("note:{}", file_path);
        let properties = serde_json::json!({
            "title": title,
            "file_path": file_path,
            "workspace_id": workspace_id,
        });
        self.conn.execute(
            "INSERT OR IGNORE INTO graph_nodes (id, node_type, reference_id, properties) VALUES (?, 'note', ?, ?)",
            rusqlite::params![source_node_id, file_path, "{}"],
        )?;
        self.conn.execute(
            "UPDATE graph_nodes SET properties = ? WHERE id = ?",
            rusqlite::params![properties.to_string(), source_node_id],
        )?;

        // Create edges for each link
        for link in links {
            let target_node_id = format!("note:{}", link.target_file);
            // Ensure target node exists
            self.conn.execute(
                "INSERT OR IGNORE INTO graph_nodes (id, node_type, reference_id, properties) VALUES (?, 'note', ?, ?)",
                rusqlite::params![target_node_id, link.target_file, "{}"],
            )?;

            let edge_id = uuid::Uuid::new_v4().to_string();
            let edge_properties = serde_json::json!({
                "context": link.context,
            });
            let rows = self.conn.execute(
                "INSERT INTO graph_edges (id, source_node_id, target_node_id, edge_type, weight, properties) VALUES (?, ?, ?, ?, 1.0, ?)",
                rusqlite::params![edge_id, source_node_id, target_node_id, link.link_type, edge_properties.to_string()],
            )?;
            eprintln!("Inserted {} edge rows for link {} -> {}", rows, source_node_id, target_node_id);
        }

        Ok(())
    }

    fn remove_graph_nodes(&self, file_path: &str) -> Result<(), NoteforgeError> {
        let node_id = format!("note:{}", file_path);
        self.conn
            .execute("DELETE FROM graph_edges WHERE source_node_id = ? OR target_node_id = ?", rusqlite::params![node_id, node_id])?;
        self.conn
            .execute("DELETE FROM graph_nodes WHERE id = ?", rusqlite::params![node_id])?;
        Ok(())
    }
}

fn extract_tags(content: &str) -> Vec<String> {
    let mut tags = Vec::new();

    // Extract #tags
    if let Ok(tag_regex) = Regex::new(r"#(\w+)") {
        for cap in tag_regex.captures_iter(content) {
            if let Some(tag) = cap.get(1) {
                tags.push(tag.as_str().to_string());
            }
        }
    }

    // Extract YAML frontmatter tags
    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let frontmatter = &content[3..3 + end];
            if let Ok(tags_regex) = Regex::new(r"tags:\s*\n((?:\s*-\s*(\w+)\n?)+)") {
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
    }

    tags.sort();
    tags.dedup();
    tags
}

pub fn extract_links(content: &str, file_path: &str) -> Vec<crate::models::Link> {
    let mut links = Vec::new();

    // Extract [[wiki-links]]
    if let Ok(wiki_link_regex) = Regex::new(r"\[\[([^\]]+)\]\]") {
        for cap in wiki_link_regex.captures_iter(content) {
            if let Some(target) = cap.get(1) {
                links.push(crate::models::Link {
                    id: uuid::Uuid::new_v4().to_string(),
                    workspace_id: String::new(),
                    source_file: file_path.to_string(),
                    target_file: target.as_str().to_string(),
                    link_type: "reference".to_string(),
                    context: Some(cap.get(0).unwrap().as_str().to_string()),
                    created_at: String::new(),
                });
            }
        }
    }

    // Extract [markdown](links)
    if let Ok(markdown_link_regex) = Regex::new(r"\[([^\]]+)\]\(([^)]+)\)") {
        for cap in markdown_link_regex.captures_iter(content) {
            if let Some(target) = cap.get(2) {
                links.push(crate::models::Link {
                    id: uuid::Uuid::new_v4().to_string(),
                    workspace_id: String::new(),
                    source_file: file_path.to_string(),
                    target_file: target.as_str().to_string(),
                    link_type: "reference".to_string(),
                    context: Some(cap.get(0).unwrap().as_str().to_string()),
                    created_at: String::new(),
                });
            }
        }
    }

    links
}

fn detect_language(file_path: &str) -> &str {
    match std::path::Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
    {
        Some("rs") => "rust",
        Some("js") | Some("jsx") => "javascript",
        Some("ts") | Some("tsx") => "typescript",
        Some("py") => "python",
        Some("java") => "java",
        Some("go") => "go",
        Some("html") | Some("htm") => "html",
        Some("css") => "css",
        Some("json") => "json",
        Some("yaml") | Some("yml") => "yaml",
        Some("toml") => "toml",
        Some("md") => "markdown",
        Some("txt") => "text",
        _ => "text",
    }
}
