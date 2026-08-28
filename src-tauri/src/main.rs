#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod cursor_tracker;
mod macro_sender;
mod material_commands;
mod materials;
mod overlay_placement;
mod pack_commands;
mod pack_edit;
mod pack_icons;
mod packs;
mod shortcut;
mod skins;
mod sounds;
mod target_window;
mod tray;
mod usage;

use std::sync::Arc;

use commands::AppState;
use config::WindowPresence;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

fn main() {
    // Build the real input backend. If it fails (e.g. no Accessibility
    // permission on macOS), fall back to a no-op sender that logs — the app
    // must still run and show the tray; the macro just won't fire.
    let sender: Arc<dyn macro_sender::MacroSender> = match macro_sender::EnigoSender::new() {
        Ok(s) => Arc::new(s),
        Err(e) => {
            eprintln!(
                "[macro] enigo init failed; macro input disabled until permission is granted: {e}"
            );
            Arc::new(macro_sender::UnavailableMacroSender::new(e))
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

                    // Yield while one of our own windows holds keyboard focus
                    // (typically the settings window recording a hotkey). The
                    // OS-level hotkey still fires, but the keystroke belongs to the
                    // recorder in the WebView — spawning the whip here would
                    // interrupt hotkey capture. Focus is the right test: this is a
                    // tray app whose windows stay alive and merely hidden, so an
                    // on-screen-presence check would swallow the hotkey forever.
                    if let Some(settings) = app.get_webview_window("settings") {
                        if target_window::any_window_focused([&settings]) {
                            return;
                        }
                    }

                    // Place the overlay over the cursor's display *before*
                    // showing it, so no frame ever flashes on the wrong (or a
                    // stale, shrunken) monitor. The placement is unconditional
                    // on every show: the frontend shrinks the overlay to a
                    // 300x110 recovery panel on macro failure, and a crash
                    // mid-shrink must not leak that size into the next launch.
                    // Intentionally no set_focus / activation policy change —
                    // the overlay stays non-activating so the terminal keeps
                    // keyboard focus for the Esc macro.
                    let placement = overlay_placement::wrap_overlay(&w);
                    if let Err(e) = &placement {
                        eprintln!("[overlay] placement failed: {e}");
                    }
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

                    // Placement passed through so the payload's cursor
                    // coordinates are in the same point space the overlay was
                    // just placed in (spawn_whip_payload recomputes only the
                    // cursor side; the origin comes from the placement).
                    let _ = w.emit(
                        "spawn-whip",
                        overlay_placement::spawn_whip_payload(
                            &w,
                            force_full,
                            placement.ok().flatten(),
                        ),
                    );
                })
                .build(),
        )
        // Embedded WebDriver server for @wdio/tauri-service — compiled and
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
            commands::open_settings,
            commands::open_input_permissions,
            material_commands::list_materials,
            pack_commands::list_packs,
            pack_commands::set_active_pack,
            pack_commands::create_custom_pack,
            pack_commands::read_local_sound_data,
            pack_commands::delete_custom_pack,
            pack_edit::update_custom_pack,
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
                    let persistent =
                        window
                            .app_handle()
                            .try_state::<AppState>()
                            .and_then(|state| {
                                state.config.lock().ok().map(|config| {
                                    config.window_presence == WindowPresence::Persistent
                                })
                            })
                            .unwrap_or(false);
                    if persistent {
                        #[cfg(target_os = "macos")]
                        {
                            let _ = window
                                .app_handle()
                                .set_activation_policy(tauri::ActivationPolicy::Regular);
                            let _ = window.hide();
                        }
                        #[cfg(not(target_os = "macos"))]
                        let _ = window.minimize();
                    } else {
                        let _ = window.hide();
                        #[cfg(target_os = "macos")]
                        let _ = window
                            .app_handle()
                            .set_activation_policy(tauri::ActivationPolicy::Accessory);
                    }
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
                sender: Mutex::new(sender),
                macro_sequence: Mutex::new(()),
                config_path,
                cursor_tracking: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
                next_macro_attempt: std::sync::atomic::AtomicU64::new(0),
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
                    shortcut::notify_startup_registration_failure(
                        app.handle(),
                        &hotkey,
                        &e.to_string(),
                    );
                }
            }
            Ok(())
        });

    // Register the embedded WebDriver server in debug builds only;
    // the Cargo.toml guard ensures this crate is absent from release binaries.
    #[cfg(debug_assertions)]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            if let Err(error) = commands::present_settings_window(handle) {
                eprintln!("[settings] failed to present from Dock reopen: {error}");
            }
        }

        #[cfg(not(target_os = "macos"))]
        let _ = (handle, event);
    });
}
