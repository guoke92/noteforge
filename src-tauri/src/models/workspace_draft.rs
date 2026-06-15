use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDraftPayload {
    pub vault_path: String,
    pub content: String,
    pub language: String,
}
