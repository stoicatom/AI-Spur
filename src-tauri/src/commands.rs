#[cfg(target_os = "macos")]
use crate::config::WindowPresence;
use crate::config::{self, Config};
use crate::cursor_tracker;
use crate::macro_sender::{
    EnigoSender, MacroFailure, MacroFailureCode, MacroSender, send_macro_sequence,
};
use crate::overlay_placement;
use crate::shortcut::{self, ConflictInfo};
use crate::skins::{self, SkinManifest};
use crate::target_window;
use crate::usage;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AppState {
    pub config: Mutex<Config>,
    /// Injected input backend. Real `EnigoSender` in production, `FakeMacroSender`
    /// in tests — this is how the trait gives us testability (R-ARCH-007).
    pub sender: Mutex<Arc<dyn MacroSender>>,
    /// Serializes the complete Esc -> text -> Enter transaction.
    pub macro_sequence: Mutex<()>,
    /// Absolute path of `config.json`, resolved once at startup from Tauri's
    /// `app_config_dir()`. Held here so the command layer never has to guess the
    /// location from a hardcoded bundle identifier (CLAUDE.md §4.3).
    pub config_path: PathBuf,
    /// Whether the overlay cursor-tracking loop is running. Set by the shortcut
    /// handler (show) and cleared by `stop_cursor_tracking` (overlay hide). One
    /// shared flag guarantees a single polling task (see `cursor_tracker`).
    pub cursor_tracking: Arc<AtomicBool>,
    pub next_macro_attempt: AtomicU64,
}

fn emit_macro_failure(app: &AppHandle, failure: &MacroFailure) {
    eprintln!(
        "[macro] {:?}: {} (retryable={})",
        failure.code, failure.message, failure.retryable
    );
    if let Err(error) = app.emit("macro-failed", failure) {
        eprintln!("[macro] failed to notify overlay: {error}");
    }
}

fn resolve_macro_attempt(state: &AppState, requested: Option<u64>) -> u64 {
    if let Some(requested) = requested.filter(|value| *value > 0) {
        let mut current = state.next_macro_attempt.load(Ordering::Relaxed);
        loop {
            if current >= requested {
                return current;
            }
            match state.next_macro_attempt.compare_exchange_weak(
                current,
                requested,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => return requested,
                Err(observed) => current = observed,
            }
        }
    } else {
        state.next_macro_attempt.fetch_add(1, Ordering::Relaxed) + 1
    }
}

/// Present the existing settings window from any native entry point.
///
/// The app is normally an accessory/tray process on macOS, so it must become
/// regular before AppKit will bring the hidden window to the foreground.
pub(crate) fn present_settings_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("settings")
        .ok_or_else(|| "settings window not found".to_string())?;

    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Regular)
        .map_err(|e| e.to_string())?;

    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<Config, String> {
    let mut config = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
    let normalized = config::normalize_config(config.clone());
    *config = normalized.clone();
    Ok(normalized)
}

fn window_presence_changed(previous: config::WindowPresence, next: config::WindowPresence) -> bool {
    previous != next
}

#[tauri::command]
pub async fn save_config(
    config: Config,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config = config::normalize_config(config);
    let (previous_hotkey, previous_window_presence) = {
        let current = state
            .config
            .lock()
            .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
        (current.hotkey.clone(), current.window_presence)
    };
    let next_window_presence = config.window_presence;

    // Keep the OS registration in step with the persisted config — without
    // this a hotkey edit would only take effect after a restart.
    //
    // The config is persisted only after the complete new shortcut set is
    // registered; a failed rebind leaves both disk and the active shortcut
    // unchanged so the user can pick another combination.
    if previous_hotkey != config.hotkey {
        let config_to_persist = config.clone();
        let config_path = state.config_path.clone();
        shortcut::rebind(&app, &previous_hotkey, &config.hotkey, move || {
            config::save_config(&config_path, &config_to_persist).map_err(|e| e.to_string())
        })?;
    } else {
        config::save_config(&state.config_path, &config).map_err(|e| e.to_string())?;
    }

    {
        let mut current = state
            .config
            .lock()
            .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
        *current = config;
    }
    #[cfg(target_os = "macos")]
    if window_presence_changed(previous_window_presence, next_window_presence) {
        app.set_activation_policy(if next_window_presence == WindowPresence::Persistent {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        })
        .map_err(|e| e.to_string())?;
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
pub async fn register_hotkey(
    hotkey: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !shortcut::validate_hotkey(&hotkey) {
        return Err(format!("Invalid hotkey format: {hotkey}"));
    }
    let current = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?
        .hotkey
        .clone();
    shortcut::rebind(&app, &current, &hotkey, || Ok(()))?;
    let mut config = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
    config.hotkey = hotkey;
    Ok(())
}

#[tauri::command]
pub async fn check_hotkey_conflict(
    hotkey: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<ConflictInfo>, String> {
    if !shortcut::validate_hotkey(&hotkey) {
        return Err(format!("Invalid hotkey format: {hotkey}"));
    }
    let previous_hotkey = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?
        .hotkey
        .clone();
    Ok(shortcut::check_conflict(
        &app,
        &hotkey,
        Some(previous_hotkey),
    ))
}

/// R-ARCH-005: Macro emission runs on the main thread because enigo's macOS
/// backend calls HIToolbox APIs (islGetInputSourceListWithAdditions) which
/// require dispatch on the main queue. The command is synchronous to avoid
/// spawning on a worker thread; Tauri automatically runs sync commands on the
/// main thread when invoked from the frontend.
#[tauri::command]
pub fn trigger_macro(
    phrase: Option<String>,
    attempt_id: Option<u64>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let attempt_id = resolve_macro_attempt(&state, attempt_id);
    // Safety gate: never inject into a window we can't confirm is a terminal.
    // Unknown frontmost app should not be spammed with Esc + text.
    //
    // When the frontmost app is not a known terminal, we still try once at the
    // pointer's location: if the cursor is over a safe terminal window, bring
    // that app to the front so the macro lands in the right input box (the
    // "鼠标下面是终端 → 聚焦并处理" strategy). Only if no safe window is under
    // the cursor do we refuse.
    if !target_window::active_app_is_safe() {
        let ready = app
            .get_webview_window("overlay")
            .and_then(|w| overlay_placement::cursor_in_points(&w))
            .map(|(x, y)| {
                // cursor_position() is primary-scaled physical pixels, but
                // app_under_cursor compares against kCGWindowBounds, which is
                // points — on a Retina primary the raw pass-through shifted
                // the hit by the scale factor and the "terminal under the
                // cursor" rescue never activated. cursor_in_points does the
                // one division that restores point space.
                target_window::app_under_cursor(x, y)
                    .map(|hit| {
                        let ok = target_window::activate_app(hit.pid);
                        if ok {
                            eprintln!(
                                "[macro] 光标下命中安全终端，已激活: {} (pid {})",
                                hit.name, hit.pid
                            );
                        }
                        ok
                    })
                    .unwrap_or(false)
            })
            .unwrap_or(false);

        if !ready {
            let failure = MacroFailure::new(
                MacroFailureCode::SafetyGate,
                "当前前台应用不是终端，已跳过发送。请切换到受支持的终端后重试。",
                false,
            )
            .with_attempt_id(attempt_id);
            emit_macro_failure(&app, &failure);
            return Err(failure.message);
        }
        // Give AppKit a tick to settle focus before synthesizing keystrokes.
        std::thread::sleep(std::time::Duration::from_millis(90));
    }

    // Server-side phrase choice (random from config) unless the caller passed
    // one explicitly (e.g. E2E test backdoors or a test app).
    let chosen = match phrase {
        Some(p) if !p.is_empty() => p,
        _ => {
            let cfg = match state
                .config
                .lock()
                .map_err(|_| "Internal state error: config lock poisoned".to_string())
            {
                Ok(config) => config,
                Err(message) => {
                    let failure = MacroFailure::new(MacroFailureCode::SendFailure, message, true)
                        .with_attempt_id(attempt_id);
                    emit_macro_failure(&app, &failure);
                    return Err(failure.message);
                }
            };
            match usage::pick_phrase(&cfg.phrases) {
                Some(phrase) => phrase,
                None => {
                    let failure = MacroFailure::new(
                        MacroFailureCode::SendFailure,
                        "提示词列表为空，无法发送。请在设置中添加至少一条提示词。",
                        true,
                    )
                    .with_attempt_id(attempt_id);
                    emit_macro_failure(&app, &failure);
                    return Err(failure.message);
                }
            }
        }
    };

    // Run directly on current thread (main thread for sync commands). A
    // startup-only unavailable backend can be refreshed after permission is
    // granted while the app is open; runtime failures are never replayed.
    // The lock covers the entire non-idempotent transaction. A second crack
    // waits until the first one has either completed or reported its failure;
    // its keystrokes can never interleave with the first sequence.
    let _sequence_guard = match state.macro_sequence.lock() {
        Ok(guard) => guard,
        Err(_) => {
            let failure = MacroFailure::new(
                MacroFailureCode::SendFailure,
                "宏发送状态异常，请重试。",
                true,
            )
            .with_attempt_id(attempt_id);
            emit_macro_failure(&app, &failure);
            return Err(failure.message);
        }
    };

    let result = {
        let sender = match state.sender.lock() {
            Ok(sender) => sender.clone(),
            Err(_) => {
                let failure = MacroFailure::new(
                    MacroFailureCode::SendFailure,
                    "输入后端状态异常，请重试。",
                    true,
                )
                .with_attempt_id(attempt_id);
                emit_macro_failure(&app, &failure);
                return Err(failure.message);
            }
        };
        let backend_unavailable = sender.is_backend_unavailable();
        let result = send_macro_sequence(sender.as_ref(), &chosen);
        (result, backend_unavailable)
    };

    let result = match result {
        (Err(_error), true) => {
            // Only the startup placeholder is safe to replace and retry. If a
            // real sender failed after emitting any prefix, replaying the full
            // macro could duplicate text in the target terminal.
            match EnigoSender::new() {
                Ok(sender) => {
                    let sender: Arc<dyn MacroSender> = Arc::new(sender);
                    let retry = send_macro_sequence(sender.as_ref(), &chosen);
                    if retry.is_ok() {
                        if let Ok(mut current) = state.sender.lock() {
                            *current = sender;
                        }
                    }
                    retry
                }
                Err(error) => Err(error),
            }
        }
        (result, _) => result,
    };

    if let Err(error) = result {
        let failure = MacroFailure::from_error(&error).with_attempt_id(attempt_id);
        eprintln!("[macro] send operation failed: {error}");
        emit_macro_failure(&app, &failure);
        return Err(failure.message);
    }

    Ok(())
}

/// Stop the overlay cursor-tracking loop.
///
/// Called by the overlay when it hides — after a crack's exit choreography, on
/// `Esc`, or any other dismissal. Idempotent: clearing an already-clear flag is
/// harmless, so the overlay can call it defensively without tracking state.
#[tauri::command]
pub fn stop_cursor_tracking(state: State<'_, AppState>) -> Result<(), String> {
    cursor_tracker::stop(&state.cursor_tracking);
    Ok(())
}

/// Show and focus the settings window.
///
/// The window is defined in tauri.conf.json with `visible: false`, so it
/// exists from startup but stays hidden until the user asks for it. Creating
/// it lazily would cost a WebView boot on every open.
#[tauri::command]
pub async fn open_settings(app: AppHandle) -> Result<(), String> {
    present_settings_window(&app)
}

/// Open the operating system's input/accessibility permission page. This is
/// intentionally distinct from AISpur's settings window.
#[tauri::command]
pub fn open_input_permissions() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        // Windows has no per-app Accessibility grant equivalent to macOS.
        // Open the real privacy diagnostics page and return guidance instead
        // of implying that a keyboard accessibility toggle grants SendInput.
        std::process::Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:privacy"])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Err(
            "Windows 不提供 macOS 式输入授权。已打开隐私设置；请确保 AISpur 与目标终端以相同权限级别运行，必要时以管理员身份启动 AISpur，并检查安全软件是否拦截键盘注入。"
                .to_string(),
        );
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg("settings://")
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("当前平台没有可用的输入权限设置入口".to_string())
}

// ── Skins ───────────────────────────────────────────────────────────────────

/// Directory holding the bundled skins.
///
/// In a packaged app they live under the Tauri resource dir; in `tauri dev`
/// that directory does not carry them, so fall back to the crate's own
/// `skins/` folder.
fn builtin_skins_dir(app: &AppHandle) -> PathBuf {
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("skins");

    // Dev: the source tree is authoritative (target/debug accumulates stale
    // resource copies that are never pruned). Packaged builds use the bundled
    // resource dir when it scans to at least one skin.
    #[cfg(not(debug_assertions))]
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("skins");
        if bundled.is_dir() && !skins::list_skins_in(&bundled).is_empty() {
            return bundled;
        }
    }

    #[cfg(debug_assertions)]
    let _ = app;

    source
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

// ── Debug-only commands for E2E testing (Phase 5) ────────────────────────────
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
    // Simulates a left-click on the tray icon → opens settings panel.
    present_settings_window(&app)
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn __test_send_macro(phrase: String) -> Result<Vec<String>, String> {
    // Exercises the full macro sequence via FakeMacroSender so E2E tests can
    // assert the call list without requiring real keyboard event permissions.
    use crate::macro_sender::{FakeMacroSender, MacroCall, send_macro_sequence};
    let fake = FakeMacroSender::new();
    send_macro_sequence(&fake, &phrase).map_err(|e| format!("macro failed: {e}"))?;
    let calls: Vec<String> = fake
        .get_calls()
        .iter()
        .map(|c| match c {
            MacroCall::Escape => "Escape".to_string(),
            MacroCall::TypeText(t) => format!("TypeText({t})"),
            MacroCall::Enter => "Enter".to_string(),
        })
        .collect();
    Ok(calls)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::macro_sender::FakeMacroSender;

    fn test_state() -> AppState {
        AppState {
            config: Mutex::new(Config::default()),
            sender: Mutex::new(Arc::new(FakeMacroSender::new())),
            macro_sequence: Mutex::new(()),
            config_path: PathBuf::from("/tmp/aispur-test-config.json"),
            cursor_tracking: Arc::new(AtomicBool::new(false)),
            next_macro_attempt: AtomicU64::new(0),
        }
    }

    #[test]
    fn macro_attempt_ids_never_regress_when_requested_id_is_stale() {
        let state = test_state();
        assert_eq!(resolve_macro_attempt(&state, Some(7)), 7);
        assert_eq!(resolve_macro_attempt(&state, Some(3)), 7);
        assert_eq!(resolve_macro_attempt(&state, None), 8);
    }

    #[test]
    fn activation_policy_only_changes_when_window_presence_changes() {
        assert!(!window_presence_changed(
            config::WindowPresence::Tray,
            config::WindowPresence::Tray
        ));
        assert!(!window_presence_changed(
            config::WindowPresence::Persistent,
            config::WindowPresence::Persistent
        ));
        assert!(window_presence_changed(
            config::WindowPresence::Tray,
            config::WindowPresence::Persistent
        ));
        assert!(window_presence_changed(
            config::WindowPresence::Persistent,
            config::WindowPresence::Tray
        ));
    }
}
