#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod macro_sender;
mod shortcut;

use commands::AppState;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

fn main() {
    let config = config::load_config().unwrap_or_default();
    let app_state = AppState {
        config: Mutex::new(config),
    };

    tauri::Builder::default()
        .manage(app_state)
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(w) = app.get_webview_window("overlay") {
                            let _ = w.emit("spawn-whip", ());
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::increment_usage,
            commands::register_hotkey,
            commands::check_hotkey_conflict,
            commands::trigger_macro,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
