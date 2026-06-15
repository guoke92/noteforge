use tauri::State;
use crate::error::NoteforgeError;
use crate::config::ConfigManager;
use crate::models::{
    GetAppConfigResponse, UpdateAppConfigRequest, GetThemeResponse, SetThemeRequest,
    CheckForUpdatesResponse,
};

#[tauri::command]
pub fn get_app_config(
    config_manager: State<ConfigManager>,
) -> Result<GetAppConfigResponse, NoteforgeError> {
    let config = config_manager.get_config();

    Ok(GetAppConfigResponse {
        theme: config.theme,
        auto_save: config.auto_save,
        auto_save_interval: config.auto_save_interval,
        font_size: config.font_size,
        tab_size: config.tab_size,
        word_wrap: config.word_wrap,
        show_line_numbers: config.show_line_numbers,
        minimap: config.minimap,
        ai_model: config.ai_model,
        ollama_endpoint: config.ollama_endpoint,
    })
}

#[tauri::command]
pub fn update_app_config(
    request: UpdateAppConfigRequest,
    config_manager: State<ConfigManager>,
) -> Result<(), NoteforgeError> {
    let mut config = config_manager.get_config();

    if let Some(theme) = request.theme {
        config.theme = theme;
    }
    if let Some(auto_save) = request.auto_save {
        config.auto_save = auto_save;
    }
    if let Some(auto_save_interval) = request.auto_save_interval {
        config.auto_save_interval = auto_save_interval;
    }
    if let Some(font_size) = request.font_size {
        config.font_size = font_size;
    }
    if let Some(tab_size) = request.tab_size {
        config.tab_size = tab_size;
    }
    if let Some(word_wrap) = request.word_wrap {
        config.word_wrap = word_wrap;
    }
    if let Some(show_line_numbers) = request.show_line_numbers {
        config.show_line_numbers = show_line_numbers;
    }
    if let Some(minimap) = request.minimap {
        config.minimap = minimap;
    }
    if let Some(ai_model) = request.ai_model {
        config.ai_model = ai_model;
    }
    if let Some(ollama_endpoint) = request.ollama_endpoint {
        config.ollama_endpoint = ollama_endpoint;
    }

    config_manager.update_config(config)?;
    Ok(())
}

#[tauri::command]
pub fn get_theme(
    config_manager: State<ConfigManager>,
) -> Result<GetThemeResponse, NoteforgeError> {
    let config = config_manager.get_config();
    Ok(GetThemeResponse {
        theme: config.theme,
    })
}

#[tauri::command]
pub fn set_theme(
    request: SetThemeRequest,
    config_manager: State<ConfigManager>,
) -> Result<(), NoteforgeError> {
    config_manager.update_theme(request.theme)
}

#[tauri::command]
pub fn check_for_updates() -> Result<CheckForUpdatesResponse, NoteforgeError> {
    Ok(CheckForUpdatesResponse {
        available: false,
        version: None,
    })
}
