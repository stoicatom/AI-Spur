#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod macro_sender;
mod shortcut;
mod skins;
mod tray;

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

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .manage(app_state)
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // OpenWhip registers at most one global shortcut at a time,
                    // so we don't need to match on `shortcut` identity here.
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
            commands::list_skins,
            commands::activate_skin,
            // Debug-only test backdoor commands (compiled in debug builds only)
            #[cfg(debug_assertions)]
            commands::__test_trigger_shortcut,
            #[cfg(debug_assertions)]
            commands::__test_click_tray,
            #[cfg(debug_assertions)]
            commands::__test_send_macro,
        ])
        .setup(|app| {
            tray::setup_tray(app.handle())?;

            // Bind the configured hotkey at launch. Without this the plugin is
            // registered but no accelerator is ever attached, leaving the
            // global shortcut dead until the user re-saves it in settings.
            let hotkey = match app.state::<AppState>().config.lock() {
                Ok(config) => Some(config.hotkey.clone()),
                Err(_) => {
                    eprintln!("[shortcut] config lock poisoned; skipping hotkey registration");
                    None
                }
            };
            if let Some(hotkey) = hotkey {
                // A taken hotkey must not abort startup — the user can pick a
                // different one in settings, so log and carry on.
                if let Err(e) = shortcut::register(app.handle(), &hotkey) {
                    eprintln!("[shortcut] failed to register {hotkey}: {e}");
                }
            }
            Ok(())
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
