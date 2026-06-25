#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tracing_subscriber::fmt::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(noteforge_lib::commands::vault_watch::VaultWatchState::default())
        .manage(noteforge_lib::commands::knowledge::KnowledgeIndexState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            noteforge_lib::db::init_database(&app_handle)?;
            noteforge_lib::config::init_config(&app_handle)?;
            noteforge_lib::scratch::init_scratch(&app_handle)?;
            noteforge_lib::workbench_session::init_workbench_session(&app_handle)?;
            noteforge_lib::workspace_draft::init_workspace_draft(&app_handle)?;
            noteforge_lib::local_history::init_local_history(&app_handle)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Workspace
            noteforge_lib::commands::workspace::create_workspace,
            noteforge_lib::commands::workspace::open_workspace,
            noteforge_lib::commands::workspace::list_workspaces,
            noteforge_lib::commands::workspace::get_workspace_config,
            noteforge_lib::commands::workspace::update_workspace_config,
            // File operations
            noteforge_lib::commands::file::read_file,
            noteforge_lib::commands::file::write_file,
            noteforge_lib::commands::file::list_directory,
            noteforge_lib::commands::file::create_file,
            noteforge_lib::commands::file::delete_file,
            noteforge_lib::commands::file::rename_file,
            noteforge_lib::commands::file::move_file,
            noteforge_lib::commands::file::file_stat,
            noteforge_lib::commands::file::read_file_range,
            noteforge_lib::commands::file::read_image_data_url,
            // Editor
            noteforge_lib::commands::editor::detect_language,
            noteforge_lib::commands::editor::format_code,
            noteforge_lib::commands::editor::get_file_info,
            // Knowledge engine
            noteforge_lib::commands::knowledge::index_knowledge_base,
            noteforge_lib::commands::knowledge::search_fulltext,
            noteforge_lib::commands::knowledge::get_knowledge_graph,
            noteforge_lib::commands::knowledge::extract_links,
            noteforge_lib::commands::knowledge::extract_tags,
            noteforge_lib::commands::knowledge::get_backlinks,
            noteforge_lib::commands::knowledge::semantic_search,
            // Agent memory
            noteforge_lib::commands::memory::monitor_memory_directory,
            noteforge_lib::commands::memory::list_agent_memories,
            noteforge_lib::commands::memory::list_agents,
            noteforge_lib::commands::memory::get_memory_timeline,
            noteforge_lib::commands::memory::update_memory,
            noteforge_lib::commands::memory::create_memory,
            noteforge_lib::commands::memory::delete_memory,
            noteforge_lib::commands::memory::batch_tag_memories,
            noteforge_lib::commands::memory::batch_delete_memories,
            noteforge_lib::commands::memory::import_agent_memories,
            // AI service
            noteforge_lib::commands::ai::ai_refine_content,
            noteforge_lib::commands::ai::ai_generate_summary,
            noteforge_lib::commands::ai::ai_suggest_tags,
            noteforge_lib::commands::ai::ai_suggest_links,
            noteforge_lib::commands::ai::ai_knowledge_qa,
            noteforge_lib::commands::ai::list_ai_models,
            noteforge_lib::commands::ai::configure_ai_model,
            // Search & filter
            noteforge_lib::commands::search::get_tags,
            noteforge_lib::commands::search::filter_by_tags,
            noteforge_lib::commands::search::get_timeline,
            // Encryption
            noteforge_lib::commands::encryption::encrypt_backup,
            noteforge_lib::commands::encryption::decrypt_backup,
            noteforge_lib::commands::encryption::store_api_key,
            noteforge_lib::commands::encryption::retrieve_api_key,
            // System config
            noteforge_lib::commands::config::get_app_config,
            noteforge_lib::commands::config::update_app_config,
            noteforge_lib::commands::config::get_theme,
            noteforge_lib::commands::config::set_theme,
            noteforge_lib::commands::config::check_for_updates,
            // Scratch buffers (unsaved drafts)
            noteforge_lib::commands::scratch::scratch_save_buffer,
            noteforge_lib::commands::scratch::scratch_load_buffer,
            noteforge_lib::commands::scratch::scratch_delete_buffer,
            noteforge_lib::commands::scratch::scratch_save_session,
            noteforge_lib::commands::scratch::scratch_restore_session,
            noteforge_lib::commands::scratch::scratch_clear_session,
            // Workbench window session (Layer B)
            noteforge_lib::commands::workbench_session::workbench_save_session,
            noteforge_lib::commands::workbench_session::workbench_load_session,
            // Workspace file drafts (Layer A for persisted files)
            noteforge_lib::commands::workspace_draft::draft_save_buffer,
            noteforge_lib::commands::workspace_draft::draft_load_buffer,
            noteforge_lib::commands::workspace_draft::draft_delete_buffer,
            // Vault file watcher
            noteforge_lib::commands::vault_watch::vault_start_watch,
            noteforge_lib::commands::vault_watch::vault_stop_watch,
            // Local history
            noteforge_lib::commands::local_history::history_save_snapshot,
            noteforge_lib::commands::local_history::history_list_snapshots,
            noteforge_lib::commands::local_history::history_load_snapshot,
            noteforge_lib::commands::local_history::history_prune_snapshots,
            noteforge_lib::commands::local_history::history_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
