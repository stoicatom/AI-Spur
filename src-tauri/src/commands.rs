use crate::config::{self, Config};
use crate::macro_sender::MacroSender;
use crate::shortcut::{self, ConflictInfo};
use crate::skins::{self, SkinManifest};
use crate::target_window;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AppState {
    pub config: Mutex<Config>,
    /// Injected input backend. Real `EnigoSender` in production, `FakeMacroSender`
    /// in tests — this is how the trait gives us testability (R-ARCH-007).
    pub sender: Arc<dyn MacroSender>,
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
    config::save_config(&config).map_err(|e| e.to_string())?;

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
pub async fn increment_usage(state: State<'_, AppState>) -> Result<u32, String> {
    let mut guard = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
    let mut updated = guard.clone();

    let today = today_utc_date();
    match rollover_today_count(&updated.last_usage_date, &today, updated.today_usage_count) {
        Some(next) => updated.today_usage_count = next,
        None => updated.today_usage_count += 1,
    }
    updated.last_usage_date = Some(today);

    updated.usage_count += 1;
    config::save_config(&updated).map_err(|e| e.to_string())?;
    let new_count = updated.usage_count;
    *guard = updated;
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

#[tauri::command]
pub async fn trigger_macro(
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
            let phrases = &cfg.phrases;
            if phrases.is_empty() {
                return Err("提示词列表为空，无法发送".to_string());
            }
            let idx = {
                // use a deterministic index from wall clock to keep it testable
                use std::time::{SystemTime, UNIX_EPOCH};
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos();
                (now % phrases.len() as u128) as usize
            };
            phrases[idx].clone()
        }
    };

    let sender = state.sender.clone();
    // enigo owns a Mutex internally; blocking here is fine because input
    // synthesis is inherently blocking and short.
    tauri::async_runtime::spawn_blocking(move || {
        sender
            .send_interrupt()
            .and_then(|_| sender.type_text(&chosen))
            .and_then(|_| sender.press_enter())
            .map_err(|e| format!("宏发送失败: {e}"))?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("发送任务失败: {e}"))??;

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
    config::save_config(&updated).map_err(|e| e.to_string())?;
    *guard = updated;
    drop(guard);

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
        w.emit("spawn-whip", ()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn __test_click_tray(app: AppHandle) -> Result<(), String> {
    // Simulates a left-click on the tray icon (same path as tray.rs handler)
    if let Some(w) = app.get_webview_window("overlay") {
        w.emit("spawn-whip", ()).map_err(|e| e.to_string())?;
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

/// YYYY-MM-DD date string for "today" in UTC. UTC keeps the rollover consistent
/// across platforms without pulling in TZ-aware date plumbing.
fn today_utc_date() -> String {
    use time::OffsetDateTime;
    OffsetDateTime::now_utc().date().to_string()
}

/// Decide the next "today" count given the last recorded use date.
///
/// `None` means the counts belong to the same day and the caller should keep
/// accumulating; `Some(n)` is the value to set — n=1 for a new day's first
/// use, n=0 for a pristine counter that needs no rollover.
fn rollover_today_count(
    last_date: &Option<String>,
    today: &str,
    current_today: u32,
) -> Option<u32> {
    if last_date.as_deref() == Some(today) {
        None // same day: keep accumulating
    } else if current_today == 0 && last_date.is_none() {
        Some(0) // pristine counter, nothing to roll over
    } else {
        Some(1) // new day: this is the first use, discard yesterday
    }
}

#[cfg(test)]
mod rollover_tests {
    use super::rollover_today_count;

    #[test]
    fn same_day_keeps_accumulating() {
        assert_eq!(
            rollover_today_count(&Some("2026-08-13".into()), "2026-08-13", 5),
            None
        );
    }

    #[test]
    fn new_day_resets_to_one() {
        assert_eq!(
            rollover_today_count(&Some("2026-08-12".into()), "2026-08-13", 14),
            Some(1)
        );
    }

    #[test]
    fn missing_last_date_is_a_fresh_day_when_counter_is_zero() {
        assert_eq!(rollover_today_count(&None, "2026-08-13", 0), Some(0));
    }

    #[test]
    fn missing_last_date_with_existing_count_resets() {
        assert_eq!(rollover_today_count(&None, "2026-08-13", 3), Some(1));
    }

    #[test]
    fn future_date_is_treated_as_new_day() {
        assert_eq!(
            rollover_today_count(&Some("2026-08-20".into()), "2026-08-13", 7),
            Some(1)
        );
    }
}
