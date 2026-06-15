use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchBufferPayload {
    pub scratch_id: String,
    pub display_name: String,
    pub language: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchSessionTab {
    pub tab_id: String,
    pub scratch_id: String,
    pub display_name: String,
    pub language: String,
    pub pane_id: String,
    pub preview_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchSessionPayload {
    pub panes: Vec<String>,
    pub active_pane_id: String,
    pub active_tab_id_by_pane: HashMap<String, String>,
    pub tabs: Vec<ScratchSessionTab>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchRestoreResponse {
    pub session: Option<ScratchSessionPayload>,
    pub buffers: Vec<ScratchBufferPayload>,
}
