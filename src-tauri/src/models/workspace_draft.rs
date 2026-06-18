use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDraftPayload {
    pub vault_path: String,
    pub content: String,
    pub language: String,
    /// Disk mtime when draft was saved (for O(1) change detection).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk_mtime: Option<String>,
    /// Disk size when draft was saved (for O(1) change detection).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk_size: Option<u64>,
}
