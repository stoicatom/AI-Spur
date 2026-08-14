//! Global cursor tracker for the overlay.
//!
//! The transparent overlay must never take keyboard focus (the terminal has to
//! stay frontmost so `Ctrl+C` + the phrase land there). A non-activating window
//! does not receive reliable DOM `mousemove` events, so the whip material would
//! sit frozen until the user clicked to "wake" the window — the root cause of
//! the "must click first" bug.
//!
//! Instead, Rust polls the global cursor position (`WebviewWindow::cursor_position`,
//! the same API `spawn_whip_payload` already uses) at ~60fps while the overlay is
//! visible and pushes each sample to the overlay as a `cursor-pos` event. The
//! overlay is then a pure consumer of positions it never had to focus to receive.
//!
//! Lifecycle: `start` flips the shared flag and spawns one polling task if none
//! is running; `stop` clears the flag and the task exits on its next tick. The
//! flag lives in `AppState` so the shortcut handler (show) and the overlay
//! (`stop_cursor_tracking` command, on hide/crack/Esc) share one source of truth.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{Emitter, Manager};

/// ~60fps. One frame is 16.6ms; 16 keeps us a touch ahead of the render loop so
/// the overlay never starves for a fresh position.
const POLL_INTERVAL: Duration = Duration::from_millis(16);

/// Convert the global physical cursor point into overlay-window logical
/// coordinates — the space the WebView renders in. Mirrors the conversion in
/// `main::spawn_whip_payload`: subtract the overlay's physical top-left and
/// divide by the display scale factor. Returns `None` if any window query fails.
fn cursor_in_overlay(window: &tauri::WebviewWindow) -> Option<(f64, f64)> {
    let cursor = window.cursor_position().ok()?;
    let origin = window.outer_position().ok()?;
    let scale = window.scale_factor().ok()?;
    Some((
        (cursor.x - origin.x as f64) / scale,
        (cursor.y - origin.y as f64) / scale,
    ))
}

/// Start pushing `cursor-pos` events for the overlay window.
///
/// Idempotent: if the flag is already set a second call is a no-op, so repeated
/// shortcut presses never stack multiple polling tasks. The task reads the flag
/// each tick and exits once it is cleared (see [`stop`]).
pub fn start(app: &tauri::AppHandle, flag: &Arc<AtomicBool>) {
    // Already running — don't spawn a second loop.
    if flag.swap(true, Ordering::SeqCst) {
        return;
    }

    let app = app.clone();
    let flag = Arc::clone(flag);
    tauri::async_runtime::spawn(async move {
        while flag.load(Ordering::SeqCst) {
            if let Some(window) = app.get_webview_window("overlay") {
                if let Some((x, y)) = cursor_in_overlay(&window) {
                    // A failed emit (window torn down mid-flight) is not worth
                    // aborting the loop for; the next tick re-checks the flag.
                    let _ = window.emit("cursor-pos", serde_json::json!({ "x": x, "y": y }));
                }
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
}

/// Stop the polling task. The running task observes the cleared flag on its next
/// tick and returns; no join is needed because it holds no resources.
pub fn stop(flag: &Arc<AtomicBool>) {
    flag.store(false, Ordering::SeqCst);
}
