#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod cursor_tracker;
mod custom_skins;
mod macro_sender;
mod material_commands;
mod materials;
mod pack_commands;
mod packs;
mod shortcut;
mod skins;
mod sound_commands;
mod sounds;
mod target_window;
mod tray;
mod usage;

use std::sync::Arc;

use commands::AppState;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

/// Build the `spawn-whip` payload, attaching the cursor position so the overlay
/// can spawn the whip at the mouse (task 4 — cursor follow).
///
/// `cursor_position()` returns a global **physical** point; subtract the
/// overlay window's physical top-left (`outer_position`) and divide by the
/// display scale factor to convert into overlay-window **logical** coordinates,
/// which is the space the WebView renders in. If any of the three window
/// queries fail, `x`/`y` are omitted and the overlay falls back to its centre.
fn spawn_whip_payload(w: &tauri::WebviewWindow, force_full: bool) -> serde_json::Value {
    let mut payload = serde_json::json!({ "forceFull": force_full });
    if let (Ok(cursor), Ok(origin), Ok(scale)) =
        (w.cursor_position(), w.outer_position(), w.scale_factor())
    {
        payload["x"] = serde_json::json!((cursor.x - origin.x as f64) / scale);
        payload["y"] = serde_json::json!((cursor.y - origin.y as f64) / scale);
    }
    payload
}

fn main() {
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

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let Some(w) = app.get_webview_window("overlay") else {
                        return;
                    };

                    // Toggle: pressing the hotkey while the overlay is up dismisses
                    // it. The overlay is a non-activating window (never focused, so
                    // the terminal keeps keyboard focus and can't receive an Esc),
                    // so the hotkey is the reliable way to dismiss without a crack.
                    let flag = app.state::<AppState>().cursor_tracking.clone();
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.emit("drop-whip", ());
                        cursor_tracker::stop(&flag);
                        let _ = w.hide();
                        return;
                    }

                    // Show it before emitting or the animation runs on an
                    // invisible window. Intentionally no set_focus / activation
                    // policy change — the overlay stays non-activating so the
                    // terminal keeps keyboard focus for the Ctrl+C macro.
                    let _ = w.show();

                    // Push global cursor positions to the overlay at ~60fps so the
                    // material follows the pointer from the first frame — a
                    // non-focused window gets no reliable DOM mousemove.
                    cursor_tracker::start(app, &flag);

                    // When the triggered shortcut is the Shift-augmented Easter-egg
                    // variant of the configured primary (only possible when the
                    // primary has no Shift), force the full animation.
                    let force_full = {
                        let primary = app
                            .state::<AppState>()
                            .config
                            .lock()
                            .map(|c| c.hotkey.clone())
                            .unwrap_or_default();
                        shortcut::is_egg_variant(&primary, shortcut.to_string().as_str())
                    };

                    let _ = w.emit("spawn-whip", spawn_whip_payload(&w, force_full));
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
            commands::stop_cursor_tracking,
            commands::list_skins,
            commands::activate_skin,
            commands::open_settings,
            custom_skins::list_custom_skins,
            custom_skins::import_custom_skin,
            custom_skins::delete_custom_skin,
            sound_commands::list_sound_presets,
            sound_commands::read_sound_data,
            sound_commands::set_crack_sound,
            sound_commands::upload_custom_sound,
            sound_commands::delete_custom_sound,
            material_commands::list_materials,
            material_commands::set_active_material,
            material_commands::upload_custom_material,
            material_commands::delete_custom_material,
            pack_commands::list_packs,
            pack_commands::set_active_pack,
            pack_commands::create_custom_pack,
            pack_commands::delete_custom_pack,
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
        .setup(move |app| {
            // Resolve the config location from Tauri so it follows the bundle
            // identifier, then carry over a pre-rename config if this is the
            // first launch after the OpenWhip → AISpur move.
            let config_dir = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("cannot resolve app config dir: {e}"))?;
            let config_path = config::config_file_in(&config_dir)
                .map_err(|e| format!("cannot prepare config dir: {e}"))?;
            config::migrate_legacy_config(&config_path);

            // A corrupt or future-version config must not block startup: fall
            // back to defaults and let the user fix it in settings.
            let config = match config::load_config(&config_path) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[config] falling back to defaults: {e}");
                    config::Config::default()
                }
            };

            app.manage(AppState {
                config: Mutex::new(config),
                sender,
                config_path,
                cursor_tracking: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            });

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
