use crate::config::{self, Config};
use crate::macro_sender::MacroSender;
use crate::shortcut::{self, ConflictInfo};
use crate::skins::{self, SkinManifest};
use crate::target_window;
use crate::usage;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AppState {
    pub config: Mutex<Config>,
    /// Injected input backend. Real `EnigoSender` in production, `FakeMacroSender`
    /// in tests — this is how the trait gives us testability (R-ARCH-007).
    pub sender: Arc<dyn MacroSender>,
    /// Absolute path of `config.json`, resolved once at startup from Tauri's
    /// `app_config_dir()`. Held here so the command layer never has to guess the
    /// location from a hardcoded bundle identifier (CLAUDE.md §4.3).
    pub config_path: PathBuf,
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
pub async fn save_config(
    config: Config,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    config::save_config(&state.config_path, &config).map_err(|e| e.to_string())?;

    let previous_hotkey = {
        let mut current = state
            .config
            .lock()
            .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
        let previous = current.hotkey.clone();
        *current = config.clone();
        previous
    };

    // Keep the OS registration in step with the persisted config — without
    // this a hotkey edit would only take effect after a restart.
    //
    // The config stays saved even if rebinding fails: that is the user's
    // stated intent, and the error surfaces in the UI so they can pick
    // another combination.
    if previous_hotkey != config.hotkey {
        shortcut::unregister_all(&app).map_err(|e| e.to_string())?;
        shortcut::register(&app, &config.hotkey).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn increment_usage(app: AppHandle, state: State<'_, AppState>) -> Result<u32, String> {
    let mut guard = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
    let mut updated = guard.clone();

    usage::apply_increment(&mut updated, &usage::today_utc_date());

    config::save_config(&state.config_path, &updated).map_err(|e| e.to_string())?;
    let new_count = updated.usage_count;
    *guard = updated.clone();
    drop(guard);

    // Counts change from the tray and the overlay too, so an open settings
    // window would otherwise keep showing a stale total until reopened.
    usage::emit_config_updated(&app, &updated);

    Ok(new_count)
}

#[tauri::command]
pub async fn register_hotkey(hotkey: String, app: AppHandle) -> Result<(), String> {
    if !shortcut::validate_hotkey(&hotkey) {
        return Err(format!("Invalid hotkey format: {hotkey}"));
    }
    shortcut::unregister_all(&app).map_err(|e| e.to_string())?;
    // The returned RegisteredShortcuts carries the primary + Easter-egg pair;
    // the command only needs to know registration succeeded.
    shortcut::register(&app, &hotkey).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_hotkey_conflict(
    hotkey: String,
    app: AppHandle,
) -> Result<Option<ConflictInfo>, String> {
    if !shortcut::validate_hotkey(&hotkey) {
        return Err(format!("Invalid hotkey format: {hotkey}"));
    }
    Ok(shortcut::check_conflict(&app, &hotkey))
}

/// R-ARCH-005: Macro emission runs on the main thread because enigo's macOS
/// backend calls HIToolbox APIs (islGetInputSourceListWithAdditions) which
/// require dispatch on the main queue. The command is synchronous to avoid
/// spawning on a worker thread; Tauri automatically runs sync commands on the
/// main thread when invoked from the frontend.
#[tauri::command]
pub fn trigger_macro(
    phrase: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Safety gate: never inject into a window we can't confirm is a terminal.
    // Unknown frontmost app should not be spammed with Ctrl+C + text.
    if !target_window::active_app_is_safe() {
        return Err("当前前台应用不是终端，已跳过发送".to_string());
    }

    // Server-side phrase choice (random from config) unless the caller passed
    // one explicitly (e.g. E2E test backdoors or a test app).
    let chosen = match phrase {
        Some(p) if !p.is_empty() => p,
        _ => {
            let cfg = state
                .config
                .lock()
                .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
            usage::pick_phrase(&cfg.phrases)
                .ok_or_else(|| "提示词列表为空，无法发送".to_string())?
        }
    };

    let sender = state.sender.clone();
    // Run directly on current thread (main thread for sync commands).
    sender
        .send_interrupt()
        .and_then(|_| sender.type_text(&chosen))
        .and_then(|_| sender.press_enter())
        .map_err(|e| format!("宏发送失败: {e}"))?;

    let _ = app; // AppHandle kept for future notifications; not needed yet.
    Ok(())
}

/// Show and focus the settings window.
///
/// The window is defined in tauri.conf.json with `visible: false`, so it
/// exists from startup but stays hidden until the user asks for it. Creating
/// it lazily would cost a WebView boot on every open.
#[tauri::command]
pub async fn open_settings(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("settings")
        .ok_or_else(|| "settings window not found".to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().ok();
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

// ── Skins ───────────────────────────────────────────────────────────────────

/// Directory holding the bundled skins.
///
/// In a packaged app they live under the Tauri resource dir; in `tauri dev`
/// that directory does not carry them, so fall back to the crate's own
/// `skins/` folder.
fn builtin_skins_dir(app: &AppHandle) -> PathBuf {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("skins");
        if bundled.is_dir() {
            return bundled;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("skins")
}

/// Directory holding user-installed skins: `app_data_dir()/skins/`.
///
/// Returns `None` when the path cannot be resolved or does not exist yet —
/// a user with no custom skins is the normal case, not an error.
fn user_skins_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("skins");
    dir.is_dir().then_some(dir)
}

#[tauri::command]
pub async fn list_skins(app: AppHandle) -> Result<Vec<SkinManifest>, String> {
    let builtin = builtin_skins_dir(&app);
    let user = user_skins_dir(&app);
    Ok(skins::list_skins(&builtin, user.as_deref()))
}

#[tauri::command]
pub async fn activate_skin(
    skin_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Verify the skin exists before persisting it as the active one.
    let builtin = builtin_skins_dir(&app);
    let user = user_skins_dir(&app);
    skins::load_skin(&skin_id, &builtin, user.as_deref()).map_err(|e| e.to_string())?;

    // Persist first, then commit to in-memory state (see increment_usage).
    let mut guard = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
    let mut updated = guard.clone();
    updated.active_skin = skin_id.clone();
    config::save_config(&state.config_path, &updated).map_err(|e| e.to_string())?;
    *guard = updated.clone();
    drop(guard);

    usage::emit_config_updated(&app, &updated);

    // Notify the overlay so it can re-render with the new skin.
    if let Some(w) = app.get_webview_window("overlay") {
        w.emit("skin-changed", serde_json::json!({ "skinId": skin_id }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ���─ Debug-only commands for E2E testing (Phase 5) ���─���──���──���───────���──���─���───���
// Compiled and registered only in debug builds (cfg(debug_assertions)).
// They invoke the same internal handler paths as real system events so that
// E2E tests can exercise the full trigger chain without a running window system.

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn __test_trigger_shortcut(
    app: AppHandle,
    shift_pressed: Option<bool>,
) -> Result<(), String> {
    // `shift_pressed` is reserved for the fast/standard mode selector (Phase 2.2)
    let _ = shift_pressed;
    if let Some(w) = app.get_webview_window("overlay") {
        w.emit("spawn-whip", serde_json::json!({ "forceFull": false }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn __test_click_tray(app: AppHandle) -> Result<(), String> {
    // Simulates a left-click on the tray icon (same path as tray.rs handler)
    if let Some(w) = app.get_webview_window("overlay") {
        w.emit("spawn-whip", serde_json::json!({ "forceFull": false }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn __test_send_macro(phrase: String) -> Result<Vec<String>, String> {
    // Exercises the full macro sequence via FakeMacroSender so E2E tests can
    // assert the call list without requiring real keyboard event permissions.
    use crate::macro_sender::{FakeMacroSender, MacroCall, MacroSender};
    let fake = FakeMacroSender::new();
    fake.send_interrupt()
        .map_err(|e| format!("interrupt failed: {e}"))?;
    fake.type_text(&phrase)
        .map_err(|e| format!("type_text failed: {e}"))?;
    fake.press_enter()
        .map_err(|e| format!("press_enter failed: {e}"))?;
    let calls: Vec<String> = fake
        .get_calls()
        .iter()
        .map(|c| match c {
            MacroCall::Interrupt => "Interrupt".to_string(),
            MacroCall::TypeText(t) => format!("TypeText({t})"),
            MacroCall::Enter => "Enter".to_string(),
        })
        .collect();
    Ok(calls)
}
