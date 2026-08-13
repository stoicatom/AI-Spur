#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod macro_sender;
mod shortcut;
mod skins;
mod target_window;
mod tray;

use std::sync::Arc;

use commands::AppState;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

fn main() {
    let config = config::load_config().unwrap_or_default();

    // Build the real input backend. If it fails (e.g. no Accessibility
    // permission on macOS), fall back to a no-op sender that logs — the app
    // must still run and show the tray; the macro just won't fire.
    let sender: Arc<dyn macro_sender::MacroSender> = match macro_sender::EnigoSender::new() {
        Ok(s) => Arc::new(s),
        Err(e) => {
            eprintln!("[macro] enigo init failed, using stub sender: {e}");
            Arc::new(macro_sender::FakeMacroSender::new())
        }
    };

    let app_state = AppState {
        config: Mutex::new(config),
        sender,
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
                            // The overlay starts hidden; show it before emitting
                            // or the animation runs on an invisible window.
                            let _ = w.show();
                            let _ = w.emit("spawn-whip", ());
                        }
                    }
                })
                .build(),
        )
        // Embedded WebDriver server for @wdio/tauri-service ��� compiled and
        // registered in debug builds only (Cargo.toml gates the crate).
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::increment_usage,
            commands::register_hotkey,
            commands::check_hotkey_conflict,
            commands::trigger_macro,
            commands::list_skins,
            commands::activate_skin,
            commands::open_settings,
            // Debug-only test backdoor commands (compiled in debug builds only)
            #[cfg(debug_assertions)]
            commands::__test_trigger_shortcut,
            #[cfg(debug_assertions)]
            commands::__test_click_tray,
            #[cfg(debug_assertions)]
            commands::__test_send_macro,
        ])
        .on_window_event(|window, event| {
            // Closing the settings window should hide it and drop the app back to
            // accessory mode, not quit: this is a tray-resident app. Without the
            // policy reset the Dock tile added when opening settings would stay.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "settings" {
                    api.prevent_close();
                    let _ = window.hide();
                    #[cfg(target_os = "macos")]
                    let _ = window
                        .app_handle()
                        .set_activation_policy(tauri::ActivationPolicy::Accessory);
                }
            }
        })
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

    // Register the embedded WebDriver server in debug builds only;
    // the Cargo.toml guard ensures this crate is absent from release binaries.
    #[cfg(debug_assertions)]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
