use noteforge_lib::db::Database;
use noteforge_lib::models::*;
use noteforge_lib::repositories::*;
use noteforge_lib::pipeline::IndexPipeline;
use rusqlite::Connection;

/// Helper: create an in-memory database with schema
fn setup_db() -> Database {
    let conn = Connection::open_in_memory().unwrap();
    let db = Database::new(conn);
    db.init_schema().unwrap();
    db
}

/// Helper: create a workspace and return its id
fn create_test_workspace(db: &Database) -> String {
    let conn = db.conn.lock().unwrap();
    let repo = WorkspaceRepo::new(&conn);
    let id = uuid::Uuid::new_v4().to_string();
    let config = WorkspaceConfig {
        name: "test-workspace".to_string(),
        path: "/tmp/test".to_string(),
        auto_index: true,
        exclude_patterns: vec![],
    };
    repo.create(&id, "test-workspace", "/tmp/test", &config).unwrap();
    id
}

// ============================================================
// Workspace Contract Tests
// ============================================================

#[test]
fn contract_workspace_create_returns_workspace_view() {
    let db = setup_db();
    let conn = db.conn.lock().unwrap();
    let repo = WorkspaceRepo::new(&conn);

    let id = uuid::Uuid::new_v4().to_string();
    let config = WorkspaceConfig {
        name: "my-notes".to_string(),
        path: "/tmp/my-notes".to_string(),
        auto_index: true,
        exclude_patterns: vec![".git".to_string()],
    };
    repo.create(&id, "my-notes", "/tmp/my-notes", &config).unwrap();

    let ws = repo.find_by_id(&id).unwrap().unwrap();
    assert_eq!(ws.name, "my-notes");
    assert_eq!(ws.path, "/tmp/my-notes");
    assert_eq!(ws.config.auto_index, true);
    assert!(ws.config.exclude_patterns.contains(&".git".to_string()));
}

#[test]
fn contract_workspace_list_returns_all() {
    let db = setup_db();
    let conn = db.conn.lock().unwrap();
    let repo = WorkspaceRepo::new(&conn);

    for i in 0..3 {
        let id = uuid::Uuid::new_v4().to_string();
        let config = WorkspaceConfig {
            name: format!("ws-{}", i),
            path: format!("/tmp/ws-{}", i),
            auto_index: true,
            exclude_patterns: vec![],
        };
        repo.create(&id, &format!("ws-{}", i), &format!("/tmp/ws-{}", i), &config)
            .unwrap();
    }

    let all = repo.list_all().unwrap();
    assert_eq!(all.len(), 3);
}

#[test]
fn contract_workspace_find_by_path() {
    let db = setup_db();
    let conn = db.conn.lock().unwrap();
    let repo = WorkspaceRepo::new(&conn);

    let id = uuid::Uuid::new_v4().to_string();
    let config = WorkspaceConfig {
        name: "target".to_string(),
        path: "/tmp/target".to_string(),
        auto_index: true,
        exclude_patterns: vec![],
    };
    repo.create(&id, "target", "/tmp/target", &config).unwrap();

    assert!(repo.find_by_path("/tmp/target").unwrap().is_some());
    assert!(repo.find_by_path("/tmp/nonexistent").unwrap().is_none());
}

// ============================================================
// Memory Contract Tests
// ============================================================

#[test]
fn contract_memory_create_with_tags() {
    let db = setup_db();
    let workspace_id = create_test_workspace(&db);
    let conn = db.conn.lock().unwrap();
    let tag_repo = TagRepo::new(&conn);

    let memory_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO memories (id, workspace_id, agent_id, content, title, type, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            memory_id,
            workspace_id,
            "agent-1",
            "User asked about Rust",
            Some("Rust Question"),
            "conversation",
            None::<String>
        ],
    )
    .unwrap();

    // Attach tags
    let tag_id = tag_repo.get_or_create("rust").unwrap();
    tag_repo.link_memory(&memory_id, &tag_id).unwrap();

    let tag_id2 = tag_repo.get_or_create("programming").unwrap();
    tag_repo.link_memory(&memory_id, &tag_id2).unwrap();

    let tags = tag_repo.get_tags_for_memory(&memory_id).unwrap();
    assert_eq!(tags.len(), 2);
    assert!(tags.contains(&"rust".to_string()));
    assert!(tags.contains(&"programming".to_string()));
}

#[test]
fn contract_list_agents_returns_distinct() {
    let db = setup_db();
    let workspace_id = create_test_workspace(&db);
    let conn = db.conn.lock().unwrap();

    for agent in &["agent-a", "agent-b", "agent-a"] {
        conn.execute(
            "INSERT INTO memories (id, workspace_id, agent_id, content, type) VALUES (?, ?, ?, ?, ?)",
            rusqlite::params![uuid::Uuid::new_v4().to_string(), workspace_id, agent, "test", "fact"],
        )
        .unwrap();
    }

    let mut stmt = conn
        .prepare("SELECT DISTINCT agent_id FROM memories ORDER BY agent_id")
        .unwrap();
    let agents: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert_eq!(agents, vec!["agent-a", "agent-b"]);
}

// ============================================================
// Note Contract Tests
// ============================================================

#[test]
fn contract_note_upsert_updates_existing() {
    let db = setup_db();
    let ws_id = create_test_workspace(&db);
    let conn = db.conn.lock().unwrap();
    let note_repo = NoteRepo::new(&conn);

    let note_id = uuid::Uuid::new_v4().to_string();
    note_repo
        .upsert(&note_id, &ws_id, "readme.md", Some("Readme"), Some("v1"), Some("markdown"))
        .unwrap();

    // Upsert again with same workspace+path
    note_repo
        .upsert(&note_id, &ws_id, "readme.md", Some("Readme"), Some("v2"), Some("markdown"))
        .unwrap();

    let note = note_repo
        .find_by_workspace_and_path(&ws_id, "readme.md")
        .unwrap()
        .unwrap();
    assert_eq!(note.content.unwrap(), "v2");
}

#[test]
fn contract_note_list_by_workspace() {
    let db = setup_db();
    let ws_id = create_test_workspace(&db);
    let conn = db.conn.lock().unwrap();
    let note_repo = NoteRepo::new(&conn);

    for i in 0..5 {
        let id = uuid::Uuid::new_v4().to_string();
        note_repo
            .upsert(
                &id,
                &ws_id,
                &format!("note-{}.md", i),
                Some(&format!("Note {}", i)),
                Some(&format!("Content {}", i)),
                Some("markdown"),
            )
            .unwrap();
    }

    let notes = note_repo.list_by_workspace(&ws_id).unwrap();
    assert_eq!(notes.len(), 5);
}

// ============================================================
// Tag Contract Tests
// ============================================================

#[test]
fn contract_tag_get_or_create_idempotent() {
    let db = setup_db();
    let conn = db.conn.lock().unwrap();
    let tag_repo = TagRepo::new(&conn);

    let id1 = tag_repo.get_or_create("rust").unwrap();
    let id2 = tag_repo.get_or_create("rust").unwrap();
    assert_eq!(id1, id2);
}

#[test]
fn contract_tag_counts_for_workspace() {
    let db = setup_db();
    let ws_id = create_test_workspace(&db);
    let conn = db.conn.lock().unwrap();
    let note_repo = NoteRepo::new(&conn);
    let tag_repo = TagRepo::new(&conn);

    // Create notes with tags
    for i in 0..3 {
        let note_id = uuid::Uuid::new_v4().to_string();
        note_repo
            .upsert(
                &note_id,
                &ws_id,
                &format!("note-{}.md", i),
                None,
                None,
                None,
            )
            .unwrap();

        let tag_id = tag_repo.get_or_create("important").unwrap();
        tag_repo.link_note(&note_id, &tag_id).unwrap();
    }

    let counts = tag_repo.get_tag_counts_for_workspace(&ws_id).unwrap();
    assert!(!counts.is_empty());
    assert_eq!(counts[0].tag, "important");
    assert_eq!(counts[0].count, 3);
}

// ============================================================
// Link Contract Tests
// ============================================================

#[test]
fn contract_link_create_and_backlinks() {
    let db = setup_db();
    let ws_id = create_test_workspace(&db);
    let conn = db.conn.lock().unwrap();
    let link_repo = LinkRepo::new(&conn);

    link_repo
        .create(
            &uuid::Uuid::new_v4().to_string(),
            &ws_id,
            "note1.md",
            "note2.md",
            "reference",
            Some("See also"),
        )
        .unwrap();

    let backlinks = link_repo.get_backlinks(&ws_id, "note2.md").unwrap();
    assert_eq!(backlinks.len(), 1);
    assert_eq!(backlinks[0].source_file, "note1.md");
    assert_eq!(backlinks[0].context, Some("See also".to_string()));
}

// ============================================================
// IndexPipeline Contract Tests
// ============================================================

#[test]
fn contract_pipeline_index_creates_all_artifacts() {
    let db = setup_db();
    let ws_id = create_test_workspace(&db);
    let conn = db.conn.lock().unwrap();
    let pipeline = IndexPipeline::new(&conn);

    let content = "---\ntags:\n  - rust\n  - tutorial\n---\n# Rust Basics\n\nThis is a [[guide]] about Rust.\n\nSee [this link](other.md) for more.";

    pipeline
        .index_document(&ws_id, "rust-basics.md", "Rust Basics", content)
        .unwrap();

    // Verify note was created
    let note_repo = NoteRepo::new(&conn);
    let note = note_repo
        .find_by_workspace_and_path(&ws_id, "rust-basics.md")
        .unwrap();
    assert!(note.is_some());

    // Verify tags were created
    let tag_repo = TagRepo::new(&conn);
    let tags = tag_repo.get_tags_for_note(&note.unwrap().id).unwrap();
    assert!(tags.contains(&"rust".to_string()));
    assert!(tags.contains(&"tutorial".to_string()));

    // Verify links were created
    let link_repo = LinkRepo::new(&conn);
    let links = link_repo.get_links_for_workspace(&ws_id).unwrap();
    assert!(links.iter().any(|l| l.target_file == "guide"));
    assert!(links.iter().any(|l| l.target_file == "other.md"));

    // Verify FTS index
    let knowledge = noteforge_lib::knowledge::KnowledgeEngine::new(&conn).unwrap();
    let results = knowledge.search("Rust", 10).unwrap();
    assert!(!results.is_empty());
}

#[test]
fn contract_pipeline_remove_cleans_all() {
    let db = setup_db();
    let ws_id = create_test_workspace(&db);
    let conn = db.conn.lock().unwrap();
    let pipeline = IndexPipeline::new(&conn);

    pipeline
        .index_document(&ws_id, "test.md", "Test", "Some content")
        .unwrap();

    pipeline.remove_document(&ws_id, "test.md").unwrap();

    let note_repo = NoteRepo::new(&conn);
    assert!(note_repo
        .find_by_workspace_and_path(&ws_id, "test.md")
        .unwrap()
        .is_none());
}

// ============================================================
// Search Contract Tests
// ============================================================

#[test]
fn contract_search_fulltext_workspace_filtered() {
    let db = setup_db();
    let ws1 = create_test_workspace(&db);
    let conn = db.conn.lock().unwrap();

    // Create ws2
    let ws2_id = uuid::Uuid::new_v4().to_string();
    let repo = WorkspaceRepo::new(&conn);
    let config = WorkspaceConfig {
        name: "ws2".to_string(),
        path: "/tmp/ws2".to_string(),
        auto_index: true,
        exclude_patterns: vec![],
    };
    repo.create(&ws2_id, "ws2", "/tmp/ws2", &config).unwrap();

    // Index docs in different workspaces
    let pipeline = IndexPipeline::new(&conn);
    pipeline
        .index_document(&ws1, "a.md", "Doc A", "Rust programming language")
        .unwrap();
    pipeline
        .index_document(&ws2_id, "b.md", "Doc B", "Python programming language")
        .unwrap();

    // Search within ws1 should only find a.md
    let knowledge = noteforge_lib::knowledge::KnowledgeEngine::new(&conn).unwrap();
    let all_results = knowledge.search("programming", 10).unwrap();
    let ws1_note_repo = NoteRepo::new(&conn);
    let ws1_paths = ws1_note_repo.get_file_paths(&ws1).unwrap();

    let ws1_results: Vec<_> = all_results
        .into_iter()
        .filter(|r| ws1_paths.contains(&r.file_path))
        .collect();

    assert_eq!(ws1_results.len(), 1);
    assert_eq!(ws1_results[0].file_path, "a.md");
}

// ============================================================
// Knowledge Graph Contract Tests
// ============================================================

#[test]
fn contract_graph_nodes_and_edges() {
    let db = setup_db();
    let ws_id = create_test_workspace(&db);
    let conn = db.conn.lock().unwrap();

    // Test link extraction directly
    let content = "Link to [[b.md]]";
    let links = noteforge_lib::pipeline::extract_links(content, "a.md");
    eprintln!("Extracted links: {:?}", links);
    assert!(!links.is_empty(), "Should extract at least one link");

    let pipeline = IndexPipeline::new(&conn);
    pipeline
        .index_document(&ws_id, "a.md", "A", content)
        .unwrap();
    pipeline
        .index_document(&ws_id, "b.md", "B", "Content B")
        .unwrap();

    // Debug: check links table
    let link_count: i32 = conn
        .query_row("SELECT COUNT(*) FROM links", [], |row| row.get(0))
        .unwrap();
    eprintln!("Links in DB: {}", link_count);

    // Debug: check all edges
    let mut stmt = conn
        .prepare("SELECT source_node_id, target_node_id, edge_type FROM graph_edges")
        .unwrap();
    let all_edges: Vec<(String, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    eprintln!("All edges: {:?}", all_edges);

    // Debug: check all nodes
    let mut stmt = conn
        .prepare("SELECT id, node_type FROM graph_nodes")
        .unwrap();
    let all_nodes: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    eprintln!("All nodes: {:?}", all_nodes);

    // Verify graph nodes exist
    let node_a: Option<String> = conn
        .query_row(
            "SELECT id FROM graph_nodes WHERE id = ?",
            rusqlite::params!["note:a.md"],
            |row| row.get(0),
        )
        .ok();
    assert!(node_a.is_some(), "Node for a.md should exist");

    // Verify graph edge exists
    let has_edge = all_edges
        .iter()
        .any(|(src, tgt, _)| src == "note:a.md" && tgt == "note:b.md");
    assert!(has_edge, "Should have edge from a.md to b.md. All edges: {:?}", all_edges);
}

// ============================================================
// Encryption Contract Tests
// ============================================================

#[test]
fn contract_encrypt_decrypt_roundtrip() {
    let service = noteforge_lib::encryption::EncryptionService::new();
    let data = b"Hello, NoteForge!";
    let password = "strong-password-123";

    let encrypted = service.encrypt_data(data, password).unwrap();
    assert_ne!(encrypted, data);

    let decrypted = service.decrypt_data(&encrypted, password).unwrap();
    assert_eq!(decrypted, data);
}

#[test]
fn contract_wrong_password_fails() {
    let service = noteforge_lib::encryption::EncryptionService::new();
    let data = b"Secret data";

    let encrypted = service.encrypt_data(data, "correct-password").unwrap();
    let result = service.decrypt_data(&encrypted, "wrong-password");
    assert!(result.is_err());
}

// ============================================================
// Config Contract Tests
// ============================================================

#[test]
fn contract_config_default_values() {
    let temp_dir = tempfile::tempdir().unwrap();
    let config_manager =
        noteforge_lib::config::ConfigManager::new(temp_dir.path().to_path_buf()).unwrap();

    let config = config_manager.get_config();
    assert_eq!(config.theme, "system");
    assert_eq!(config.font_size, 14);
    assert_eq!(config.tab_size, 2);
    assert_eq!(config.ai_model, "llama3");
}

#[test]
fn contract_config_persists() {
    let temp_dir = tempfile::tempdir().unwrap();
    let config_manager =
        noteforge_lib::config::ConfigManager::new(temp_dir.path().to_path_buf()).unwrap();

    let mut config = config_manager.get_config();
    config.theme = "dark".to_string();
    config.font_size = 18;
    config_manager.update_config(config).unwrap();

    // Re-read from disk
    let config_manager2 =
        noteforge_lib::config::ConfigManager::new(temp_dir.path().to_path_buf()).unwrap();
    let config2 = config_manager2.get_config();
    assert_eq!(config2.theme, "dark");
    assert_eq!(config2.font_size, 18);
}
