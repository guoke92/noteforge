use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;
use crate::error::NoteforgeError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
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

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            auto_save: true,
            auto_save_interval: 30,
            font_size: 14,
            tab_size: 2,
            word_wrap: true,
            show_line_numbers: true,
            minimap: true,
            ai_model: "llama3".to_string(),
            ollama_endpoint: "http://localhost:11434".to_string(),
        }
    }
}

pub struct ConfigManager {
    config_path: PathBuf,
    config: Mutex<AppConfig>,
}

impl ConfigManager {
    pub fn new(app_dir: PathBuf) -> Result<Self, NoteforgeError> {
        let config_path = app_dir.join("config.json");
        let config = if config_path.exists() {
            let data = fs::read_to_string(&config_path)?;
            serde_json::from_str(&data)?
        } else {
            AppConfig::default()
        };
        
        Ok(Self { 
            config_path, 
            config: Mutex::new(config),
        })
    }
    
    pub fn get_config(&self) -> AppConfig {
        self.config.lock().unwrap().clone()
    }
    
    pub fn update_config(&self, new_config: AppConfig) -> Result<(), NoteforgeError> {
        let mut config = self.config.lock().unwrap();
        *config = new_config;
        let data = serde_json::to_string_pretty(&*config)?;
        fs::write(&self.config_path, data)?;
        Ok(())
    }
    
    pub fn update_theme(&self, theme: String) -> Result<(), NoteforgeError> {
        let mut config = self.config.lock().unwrap();
        config.theme = theme;
        let data = serde_json::to_string_pretty(&*config)?;
        fs::write(&self.config_path, data)?;
        Ok(())
    }
}

pub fn init_config(app: &AppHandle) -> Result<(), NoteforgeError> {
    let app_dir = app.path().app_data_dir().map_err(|e| NoteforgeError::Internal(e.to_string()))?;
    std::fs::create_dir_all(&app_dir).map_err(|e| NoteforgeError::Internal(e.to_string()))?;
    
    let config_manager = ConfigManager::new(app_dir)?;
    app.manage(config_manager);
    
    Ok(())
}