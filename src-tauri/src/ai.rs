use reqwest::Client;
use crate::error::NoteforgeError;
use crate::models::{RefineResult, LinkSuggestion, QaResult, ModelInfo};

pub struct AiService {
    client: Client,
    ollama_endpoint: String,
}

impl AiService {
    pub fn new(ollama_endpoint: &str) -> Self {
        Self {
            client: Client::new(),
            ollama_endpoint: ollama_endpoint.to_string(),
        }
    }

    pub async fn refine_content(
        &self,
        content: &str,
        instruction: &str,
        model: Option<&str>,
    ) -> Result<RefineResult, NoteforgeError> {
        let model = model.unwrap_or("llama3");
        let prompt = format!(
            "Please refine the following content according to this instruction: {}\n\nContent:\n{}",
            instruction, content
        );

        let response = self.call_ollama(model, &prompt).await?;
        let diff = compute_diff(content, &response);

        Ok(RefineResult { result: response, diff })
    }

    pub async fn generate_summary(
        &self,
        content: &str,
        model: Option<&str>,
    ) -> Result<String, NoteforgeError> {
        let model = model.unwrap_or("llama3");
        let prompt = format!(
            "Please generate a concise summary of the following content:\n\n{}",
            content
        );

        self.call_ollama(model, &prompt).await
    }

    pub async fn suggest_tags(
        &self,
        content: &str,
        model: Option<&str>,
    ) -> Result<Vec<String>, NoteforgeError> {
        let model = model.unwrap_or("llama3");
        let prompt = format!(
            "Please suggest relevant tags for the following content. Return only the tags separated by commas:\n\n{}",
            content
        );

        let response = self.call_ollama(model, &prompt).await?;
        let tags = response
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        Ok(tags)
    }

    pub async fn suggest_links(
        &self,
        content: &str,
        existing_notes: &[String],
        model: Option<&str>,
    ) -> Result<Vec<LinkSuggestion>, NoteforgeError> {
        let model = model.unwrap_or("llama3");
        let notes_str = existing_notes.join("\n");
        let prompt = format!(
            "Based on the following content, suggest links to existing notes. Return JSON array with 'note' and 'relevance' fields:\n\nContent:\n{}\n\nExisting Notes:\n{}",
            content, notes_str
        );

        let response = self.call_ollama(model, &prompt).await?;
        let suggestions: Vec<LinkSuggestion> =
            serde_json::from_str(&response).unwrap_or_default();

        Ok(suggestions)
    }

    pub async fn knowledge_qa(
        &self,
        question: &str,
        workspace_id: &str,
        model: Option<&str>,
    ) -> Result<QaResult, NoteforgeError> {
        let model = model.unwrap_or("llama3");
        let prompt = format!(
            "Answer the following question based on the knowledge base for workspace {}:\n\n{}",
            workspace_id, question
        );

        let answer = self.call_ollama(model, &prompt).await?;

        Ok(QaResult {
            answer,
            sources: vec![],
        })
    }

    pub async fn list_models(&self, model_type: &str) -> Result<Vec<ModelInfo>, NoteforgeError> {
        let response = self
            .client
            .get(format!("{}/api/tags", self.ollama_endpoint))
            .send()
            .await?
            .json::<serde_json::Value>()
            .await?;

        let models = response["models"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|m| {
                let name = m["name"].as_str()?;
                let size = m["size"].as_u64().unwrap_or(0);
                Some(ModelInfo {
                    name: name.to_string(),
                    size,
                    model_type: model_type.to_string(),
                })
            })
            .collect();

        Ok(models)
    }

    pub async fn configure_model(
        &self,
        provider: &str,
        _api_key: Option<&str>,
        endpoint: Option<&str>,
    ) -> Result<(), NoteforgeError> {
        if provider == "ollama" {
            if let Some(endpoint) = endpoint {
                self.client
                    .get(format!("{}/api/tags", endpoint))
                    .send()
                    .await
                    .map_err(|e| {
                        NoteforgeError::Ai(format!("Failed to connect to Ollama: {}", e))
                    })?;
            }
        }

        Ok(())
    }

    pub async fn call_ollama(&self, model: &str, prompt: &str) -> Result<String, NoteforgeError> {
        let request = OllamaRequest {
            model: model.to_string(),
            prompt: prompt.to_string(),
            stream: false,
        };

        let response = self
            .client
            .post(format!("{}/api/generate", self.ollama_endpoint))
            .json(&request)
            .send()
            .await?
            .json::<OllamaResponse>()
            .await?;

        Ok(response.response)
    }
}

fn compute_diff(original: &str, modified: &str) -> String {
    let diff = diff::lines(original, modified);
    let mut result = String::new();

    for change in diff {
        match change {
            diff::Result::Left(l) => result.push_str(&format!("-{}\n", l)),
            diff::Result::Right(r) => result.push_str(&format!("+{}\n", r)),
            diff::Result::Both(b, _) => result.push_str(&format!(" {}\n", b)),
        }
    }

    result
}

#[derive(Debug, serde::Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Debug, serde::Deserialize)]
struct OllamaResponse {
    response: String,
}
