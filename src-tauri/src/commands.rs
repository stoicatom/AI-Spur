use crate::config::{self, Config};
use crate::shortcut::{self, ConflictInfo};
use std::sync::Mutex;
use tauri::{AppHandle, State};

pub struct AppState {
    pub config: Mutex<Config>,
}

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<Config, String> {
    let config = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub async fn save_config(config: Config, state: State<'_, AppState>) -> Result<(), String> {
    config::save_config(&config).map_err(|e| e.to_string())?;
    let mut current = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
    *current = config;
    Ok(())
}

#[tauri::command]
pub async fn increment_usage(state: State<'_, AppState>) -> Result<u32, String> {
    let mut guard = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
    let mut updated = guard.clone();
    updated.usage_count += 1;
    updated.today_usage_count += 1;
    config::save_config(&updated).map_err(|e| e.to_string())?;
    let new_count = updated.usage_count;
    *guard = updated;
    Ok(new_count)
}

#[tauri::command]
pub async fn register_hotkey(hotkey: String, app: AppHandle) -> Result<(), String> {
    if !shortcut::validate_hotkey(&hotkey) {
        return Err(format!("无效的快捷键格式: {hotkey}"));
    }
    shortcut::unregister_all(&app).map_err(|e| e.to_string())?;
    shortcut::register(&app, &hotkey).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_hotkey_conflict(
    hotkey: String,
    app: AppHandle,
) -> Result<Option<ConflictInfo>, String> {
    if !shortcut::validate_hotkey(&hotkey) {
        return Err(format!("无效的快捷键格式: {hotkey}"));
    }
    Ok(shortcut::check_conflict(&app, &hotkey))
}

#[tauri::command]
pub async fn trigger_macro(_phrase: Option<String>) -> Result<(), String> {
    Ok(())
}
