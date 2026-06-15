use noteforge_lib::db::Database;
use noteforge_lib::knowledge::KnowledgeEngine;
use noteforge_lib::config::ConfigManager;
use noteforge_lib::encryption::EncryptionService;
use noteforge_lib::models::*;
use noteforge_lib::repositories::*;
use rusqlite::Connection;

#[test]
fn test_database_initialization() {
    let conn = Connection::open_in_memory().unwrap();
    let db = Database::new(conn);
    assert!(db.init_schema().is_ok());
}

#[test]
fn test_knowledge_engine_search() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(content, title, file_path);").unwrap();

    let engine = KnowledgeEngine::new(&conn).unwrap();
    engine
        .index_document("test.md", "Test Document", "This is a test document")
        .unwrap();

    let results = engine.search("test", 10).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].file_path, "test.md");
}

#[test]
fn test_config_manager() {
    let temp_dir = tempfile::tempdir().unwrap();
    let config_manager = ConfigManager::new(temp_dir.path().to_path_buf()).unwrap();

    let config = config_manager.get_config();
    assert_eq!(config.theme, "system");

    let new_config = noteforge_lib::config::AppConfig {
        theme: "dark".to_string(),
        ..config
    };
    config_manager.update_config(new_config).unwrap();

    let updated_config = config_manager.get_config();
    assert_eq!(updated_config.theme, "dark");
}

#[test]
fn test_encryption_service() {
    let encryption_service = EncryptionService::new();

    let data = b"Hello, World!";
    let password = "test_password";

    let encrypted = encryption_service.encrypt_data(data, password).unwrap();
    let decrypted = encryption_service.decrypt_data(&encrypted, password).unwrap();

    assert_eq!(data.to_vec(), decrypted);
}

#[test]
fn test_workspace_repo_crud() {
    let conn = Connection::open_in_memory().unwrap();
    let db = Database::new(conn);
    db.init_schema().unwrap();

    let conn = db.conn.lock().unwrap();
    let repo = WorkspaceRepo::new(&conn);

    // Create
    let id = uuid::Uuid::new_v4().to_string();
    let config = WorkspaceConfig {
        name: "test".to_string(),
        path: "/tmp/test".to_string(),
        auto_index: true,
        exclude_patterns: vec![],
    };
    repo.create(&id, "test", "/tmp/test", &config).unwrap();

    // Read
    let ws = repo.find_by_id(&id).unwrap().unwrap();
    assert_eq!(ws.name, "test");

    // List
    let all = repo.list_all().unwrap();
    assert_eq!(all.len(), 1);

    // Update
    let new_config = WorkspaceConfig {
        name: "updated".to_string(),
        path: "/tmp/test".to_string(),
        auto_index: false,
        exclude_patterns: vec!["node_modules".to_string()],
    };
    repo.update_config(&id, "updated", &new_config).unwrap();
    let ws = repo.find_by_id(&id).unwrap().unwrap();
    assert_eq!(ws.name, "updated");
    assert_eq!(ws.config.auto_index, false);
}

#[test]
fn test_note_repo_crud() {
    let conn = Connection::open_in_memory().unwrap();
    let db = Database::new(conn);
    db.init_schema().unwrap();

    let ws_id = {
        let conn = db.conn.lock().unwrap();
        let ws_repo = WorkspaceRepo::new(&conn);
        let id = uuid::Uuid::new_v4().to_string();
        let config = WorkspaceConfig {
            name: "test".to_string(),
            path: "/tmp/test".to_string(),
            auto_index: true,
            exclude_patterns: vec![],
        };
        ws_repo.create(&id, "test", "/tmp/test", &config).unwrap();
        id
    };

    let conn = db.conn.lock().unwrap();
    let note_repo = NoteRepo::new(&conn);

    // Create
    let note_id = uuid::Uuid::new_v4().to_string();
    note_repo
        .upsert(
            &note_id,
            &ws_id,
            "readme.md",
            Some("Readme"),
            Some("Hello"),
            Some("markdown"),
        )
        .unwrap();

    // Read
    let note = note_repo.find_by_id(&note_id).unwrap().unwrap();
    assert_eq!(note.file_path, "readme.md");
    assert_eq!(note.title, Some("Readme".to_string()));

    // List
    let notes = note_repo.list_by_workspace(&ws_id).unwrap();
    assert_eq!(notes.len(), 1);

    // Update
    note_repo
        .update(&note_id, Some("New Title"), Some("New Content"))
        .unwrap();
    let note = note_repo.find_by_id(&note_id).unwrap().unwrap();
    assert_eq!(note.title, Some("New Title".to_string()));
    assert_eq!(note.content, Some("New Content".to_string()));

    // Delete
    note_repo.delete(&note_id).unwrap();
    assert!(note_repo.find_by_id(&note_id).unwrap().is_none());
}

#[test]
fn test_tag_repo_operations() {
    let conn = Connection::open_in_memory().unwrap();
    let db = Database::new(conn);
    db.init_schema().unwrap();

    let conn = db.conn.lock().unwrap();
    let tag_repo = TagRepo::new(&conn);

    // get_or_create is idempotent
    let id1 = tag_repo.get_or_create("rust").unwrap();
    let id2 = tag_repo.get_or_create("rust").unwrap();
    assert_eq!(id1, id2);

    // find_by_name
    let found = tag_repo.find_by_name("rust").unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap(), id1);

    // find_by_name for nonexistent
    let not_found = tag_repo.find_by_name("nonexistent").unwrap();
    assert!(not_found.is_none());
}
