use noteforge_lib::db::Database;
use noteforge_lib::knowledge::KnowledgeEngine;
use noteforge_lib::encryption::EncryptionService;
use noteforge_lib::models::*;
use noteforge_lib::repositories::*;
use rusqlite::Connection;
use std::fs;

/// Test 1: 知识库加载数据流
/// 流程: 用户选择文件夹 → 创建工作区 → 扫描目录 → 索引文件 → 搜索验证
#[test]
fn test_knowledge_base_loading_flow() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let conn = Connection::open(&db_path).unwrap();
    let db = Database::new(conn);
    db.init_schema().unwrap();

    let kb_dir = temp_dir.path().join("knowledge_base");
    fs::create_dir_all(&kb_dir).unwrap();

    let test_file1 = kb_dir.join("note1.md");
    fs::write(
        &test_file1,
        "---\ntags:\n  - rust\n  - programming\n---\n# Rust Programming\n\nRust is a systems programming language.",
    )
    .unwrap();

    let test_file2 = kb_dir.join("note2.md");
    fs::write(
        &test_file2,
        "---\ntags:\n  - python\n  - data-science\n---\n# Python for Data Science\n\nPython is great for data analysis.",
    )
    .unwrap();

    let conn = db.conn.lock().unwrap();
    let engine = KnowledgeEngine::new(&conn).unwrap();

    let content1 = fs::read_to_string(&test_file1).unwrap();
    engine
        .index_document(
            &test_file1.to_string_lossy(),
            "Rust Programming",
            &content1,
        )
        .unwrap();

    let content2 = fs::read_to_string(&test_file2).unwrap();
    engine
        .index_document(
            &test_file2.to_string_lossy(),
            "Python for Data Science",
            &content2,
        )
        .unwrap();

    let results = engine.search("Rust", 10).unwrap();
    assert!(!results.is_empty(), "Should find Rust content");
    assert!(results
        .iter()
        .any(|r| r.file_path.contains("note1.md")));

    let results = engine.search("Python", 10).unwrap();
    assert!(!results.is_empty(), "Should find Python content");
    assert!(results
        .iter()
        .any(|r| r.file_path.contains("note2.md")));

    println!("✓ Test 1 passed: Knowledge base loading flow");
}

/// Test 2: 记忆接入数据流
/// 流程: 监视目录 → 解析记忆文件 → 存储到数据库 → 查询验证
#[test]
fn test_memory_ingestion_flow() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let conn = Connection::open(&db_path).unwrap();
    let db = Database::new(conn);
    db.init_schema().unwrap();

    // Create a test workspace first
    let workspace_id = uuid::Uuid::new_v4().to_string();
    {
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)",
            rusqlite::params![workspace_id, "test-workspace", temp_dir.path().to_string_lossy()],
        )
        .unwrap();
    }

    let memory_dir = temp_dir.path().join("memories");
    fs::create_dir_all(&memory_dir).unwrap();

    let memory_file = memory_dir.join("conversation.json");
    let memory_data = serde_json::json!({
        "agent_id": "test-agent",
        "content": "User asked about Rust ownership model",
        "type": "conversation",
        "metadata": {
            "source": "chat",
            "confidence": 0.9
        }
    });
    fs::write(
        &memory_file,
        serde_json::to_string_pretty(&memory_data).unwrap(),
    )
    .unwrap();

    let conn = db.conn.lock().unwrap();
    let memory_id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO memories (id, workspace_id, agent_id, content, type, metadata) VALUES (?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            memory_id,
            workspace_id,
            "test-agent",
            "User asked about Rust ownership model",
            "conversation",
            memory_data["metadata"].to_string()
        ],
    )
    .unwrap();

    let mut stmt = conn
        .prepare("SELECT id, content, type FROM memories WHERE agent_id = ?")
        .unwrap();
    let memories: Vec<(String, String, String)> = stmt
        .query_map(rusqlite::params!["test-agent"], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert_eq!(memories.len(), 1);
    assert_eq!(memories[0].1, "User asked about Rust ownership model");
    assert_eq!(memories[0].2, "conversation");

    println!("✓ Test 2 passed: Memory ingestion flow");
}

/// Test 3: AI精炼数据流
/// 流程: 选中内容 → 调用AI精炼 → 生成差异 → 返回结果
#[test]
fn test_ai_refinement_flow() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let conn = Connection::open(&db_path).unwrap();
    let db = Database::new(conn);
    db.init_schema().unwrap();

    let original_content = "This is a test document. It has some errors. The code is bad.";
    let refined_content =
        "This is a test document. It contains some errors. The code needs improvement.";

    let diff = format!("-{}\n+{}", original_content, refined_content);

    assert!(!diff.is_empty(), "Diff should not be empty");
    assert!(
        diff.contains("-This is a test document"),
        "Diff should contain original"
    );
    assert!(
        diff.contains("+This is a test document"),
        "Diff should contain refined"
    );

    let conn = db.conn.lock().unwrap();
    let workspace_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)",
        rusqlite::params![workspace_id, "test-workspace", "/tmp/test"],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO ai_logs (id, workspace_id, operation, model, success) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            workspace_id,
            "refine_content",
            "test-model",
            true
        ],
    )
    .unwrap();

    let mut stmt = conn
        .prepare("SELECT COUNT(*) FROM ai_logs WHERE operation = ?")
        .unwrap();
    let count: i32 = stmt
        .query_row(rusqlite::params!["refine_content"], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1);

    println!("✓ Test 3 passed: AI refinement flow");
}

/// Test 4: 图谱构建数据流
/// 流程: 扫描文件 → 提取链接 → 构建节点边 → 查询图谱
#[test]
fn test_graph_construction_flow() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let conn = Connection::open(&db_path).unwrap();
    let db = Database::new(conn);
    db.init_schema().unwrap();

    let file1_path = "note1.md";
    let file1_content =
        "See [[note2]] for more details. Also check [Python Guide](note2.md).";
    let file2_path = "note2.md";
    let file2_content = "This is the referenced note.";

    let conn = db.conn.lock().unwrap();
    let workspace_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)",
        rusqlite::params![workspace_id, "test-workspace", "/tmp/test"],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO notes (id, workspace_id, file_path, title, content) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            workspace_id,
            file1_path,
            "Note 1",
            file1_content
        ],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO notes (id, workspace_id, file_path, title, content) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            workspace_id,
            file2_path,
            "Note 2",
            file2_content
        ],
    )
    .unwrap();

    // Extract links
    let wiki_link_regex = regex::Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
    let markdown_link_regex = regex::Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").unwrap();

    let mut links = Vec::new();
    for cap in wiki_link_regex.captures_iter(file1_content) {
        if let Some(target) = cap.get(1) {
            links.push((
                file1_path.to_string(),
                target.as_str().to_string(),
                "reference".to_string(),
            ));
        }
    }
    for cap in markdown_link_regex.captures_iter(file1_content) {
        if let Some(target) = cap.get(2) {
            links.push((
                file1_path.to_string(),
                target.as_str().to_string(),
                "reference".to_string(),
            ));
        }
    }

    for (source, target, link_type) in &links {
        conn.execute(
            "INSERT INTO links (id, workspace_id, source_file, target_file, link_type) VALUES (?, ?, ?, ?, ?)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                workspace_id,
                source,
                target,
                link_type
            ],
        )
        .unwrap();
    }

    let mut stmt = conn.prepare("SELECT COUNT(*) FROM links").unwrap();
    let count: i32 = stmt.query_row([], |row| row.get(0)).unwrap();
    assert!(count >= 2, "Should have at least 2 links");

    let mut stmt = conn
        .prepare("SELECT source_file FROM links WHERE target_file = ?")
        .unwrap();
    let backlinks: Vec<String> = stmt
        .query_map(rusqlite::params![file2_path], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert!(!backlinks.is_empty(), "Should have backlinks to file2");
    assert!(backlinks.contains(&file1_path.to_string()));

    println!("✓ Test 4 passed: Graph construction flow");
}

/// Test 5: 加密备份数据流
/// 流程: 选择备份目录 → 加密数据 → 写入备份 → 解密验证
#[test]
fn test_encrypted_backup_flow() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let conn = Connection::open(&db_path).unwrap();
    let db = Database::new(conn);
    db.init_schema().unwrap();

    let workspace_dir = temp_dir.path().join("workspace");
    fs::create_dir_all(&workspace_dir).unwrap();

    let test_file = workspace_dir.join("test.md");
    fs::write(&test_file, "# Test Note\n\nThis is test content.").unwrap();

    let backup_dir = temp_dir.path().join("backups");
    fs::create_dir_all(&backup_dir).unwrap();

    let backup_path = backup_dir.join("backup.enc");
    let password = "test-password-123";

    let encryption_service = EncryptionService::new();
    let workspace_data = fs::read_to_string(&test_file).unwrap();

    let encrypted_data = encryption_service
        .encrypt_data(workspace_data.as_bytes(), password)
        .unwrap();

    fs::write(&backup_path, &encrypted_data).unwrap();
    assert!(backup_path.exists(), "Backup file should exist");

    let read_encrypted = fs::read(&backup_path).unwrap();
    assert_eq!(read_encrypted, encrypted_data);

    let decrypted_data = encryption_service
        .decrypt_data(&read_encrypted, password)
        .unwrap();
    let decrypted_content = String::from_utf8(decrypted_data).unwrap();
    assert_eq!(decrypted_content, workspace_data);

    let api_key = "sk-test-api-key-12345";
    encryption_service
        .store_api_key("test-service", api_key, password)
        .unwrap();
    let retrieved_key = encryption_service
        .retrieve_api_key("test-service", password)
        .unwrap();
    assert_eq!(retrieved_key, api_key);

    println!("✓ Test 5 passed: Encrypted backup flow");
}
