use tauri::State;
use crate::error::NoteforgeError;
use crate::ai::AiService;
use crate::config::ConfigManager;
use crate::knowledge::KnowledgeEngine;
use crate::models::{
    AiRefineContentRequest, AiGenerateSummaryRequest, AiSuggestTagsRequest,
    AiSuggestLinksRequest, AiKnowledgeQaRequest, ListAiModelsRequest,
    ConfigureAiModelRequest, LinkSuggestion, ModelInfo, QaResult, RefineResult,
};
use crate::db::Database;

#[tauri::command]
pub async fn ai_refine_content(
    request: AiRefineContentRequest,
    config_manager: State<'_, ConfigManager>,
) -> Result<RefineResult, NoteforgeError> {
    let config = config_manager.get_config();
    let ai_service = AiService::new(&config.ollama_endpoint);
    ai_service
        .refine_content(&request.content, &request.instruction, request.model.as_deref())
        .await
}

#[tauri::command]
pub async fn ai_generate_summary(
    request: AiGenerateSummaryRequest,
    config_manager: State<'_, ConfigManager>,
) -> Result<String, NoteforgeError> {
    let config = config_manager.get_config();
    let ai_service = AiService::new(&config.ollama_endpoint);
    ai_service
        .generate_summary(&request.content, request.model.as_deref())
        .await
}

#[tauri::command]
pub async fn ai_suggest_tags(
    request: AiSuggestTagsRequest,
    config_manager: State<'_, ConfigManager>,
) -> Result<Vec<String>, NoteforgeError> {
    let config = config_manager.get_config();
    let ai_service = AiService::new(&config.ollama_endpoint);
    ai_service
        .suggest_tags(&request.content, request.model.as_deref())
        .await
}

#[tauri::command]
pub async fn ai_suggest_links(
    request: AiSuggestLinksRequest,
    config_manager: State<'_, ConfigManager>,
) -> Result<Vec<LinkSuggestion>, NoteforgeError> {
    let config = config_manager.get_config();
    let ai_service = AiService::new(&config.ollama_endpoint);
    ai_service
        .suggest_links(&request.content, &request.existing_notes, request.model.as_deref())
        .await
}

#[tauri::command]
pub async fn ai_knowledge_qa(
    request: AiKnowledgeQaRequest,
    config_manager: State<'_, ConfigManager>,
    db: State<'_, Database>,
) -> Result<QaResult, NoteforgeError> {
    let config = config_manager.get_config();

    // RAG: first retrieve relevant context (do DB work before await)
    let (context, sources) = {
        let conn = db.conn.lock().unwrap();
        let engine = KnowledgeEngine::new(&conn)?;
        let search_results = engine.search(&request.question, 5)?;

        let mut context = String::new();
        let mut sources = Vec::new();
        for result in &search_results {
            context.push_str(&format!(
                "---\nFile: {}\nTitle: {}\nContent:\n{}\n\n",
                result.file_path, result.title, result.content
            ));
            sources.push(result.file_path.clone());
        }
        (context, sources)
    };

    // Build RAG prompt (after releasing the lock)
    let rag_prompt = format!(
        "Based on the following knowledge base context, answer the question.\n\nContext:\n{}\n\nQuestion: {}",
        context, request.question
    );

    let ai_service = AiService::new(&config.ollama_endpoint);
    let answer = ai_service
        .call_ollama(&config.ai_model, &rag_prompt)
        .await?;

    Ok(QaResult { answer, sources })
}

#[tauri::command]
pub async fn list_ai_models(
    request: ListAiModelsRequest,
    config_manager: State<'_, ConfigManager>,
) -> Result<Vec<ModelInfo>, NoteforgeError> {
    let config = config_manager.get_config();
    let ai_service = AiService::new(&config.ollama_endpoint);
    ai_service.list_models(&request.r#type).await
}

#[tauri::command]
pub async fn configure_ai_model(
    request: ConfigureAiModelRequest,
    config_manager: State<'_, ConfigManager>,
) -> Result<(), NoteforgeError> {
    let config = config_manager.get_config();
    let ai_service = AiService::new(&config.ollama_endpoint);
    ai_service
        .configure_model(
            &request.provider,
            request.api_key.as_deref(),
            request.endpoint.as_deref(),
        )
        .await
}
