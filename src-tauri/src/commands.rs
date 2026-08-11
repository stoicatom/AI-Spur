use crate::config::{self, Config};
use tauri::State;
use std::sync::Mutex;

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

// 占位命令（Phase 2 实现）
#[tauri::command]
pub async fn register_hotkey(_hotkey: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn trigger_macro(_phrase: Option<String>) -> Result<(), String> {
    Ok(())
}
