#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod macro_sender;

use commands::AppState;
use std::sync::Mutex;

fn main() {
    let config = config::load_config().unwrap_or_default();
    let app_state = AppState {
        config: Mutex::new(config),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::increment_usage,
            commands::register_hotkey,
            commands::trigger_macro,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
