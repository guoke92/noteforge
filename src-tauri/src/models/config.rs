use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAppConfigResponse {
    pub theme: String,
    pub auto_save: bool,
    pub auto_save_interval: u32,
    pub font_size: u32,
    pub tab_size: u32,
    pub word_wrap: bool,
    pub show_line_numbers: bool,
    pub minimap: bool,
    pub ai_model: String,
    pub ollama_endpoint: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAppConfigRequest {
    pub theme: Option<String>,
    pub auto_save: Option<bool>,
    pub auto_save_interval: Option<u32>,
    pub font_size: Option<u32>,
    pub tab_size: Option<u32>,
    pub word_wrap: Option<bool>,
    pub show_line_numbers: Option<bool>,
    pub minimap: Option<bool>,
    pub ai_model: Option<String>,
    pub ollama_endpoint: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetThemeResponse {
    pub theme: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetThemeRequest {
    pub theme: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckForUpdatesResponse {
    pub available: bool,
    pub version: Option<String>,
}
