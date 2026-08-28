//! Overlay placement: make the whip overlay cover the display the cursor is on.
//!
//! Root cause this module fixes: the overlay was created at a hardcoded
//! 1920x1080 and never repositioned, so with the cursor on a second display the
//! animation landed on the primary. Placement must also be **unconditional** on
//! every `show()`: the frontend shrinks the overlay to a 300x110 recovery panel
//! on macro failure, so if the app is killed mid-shrink the next launch would
//! otherwise inherit the small geometry.
//!
//! # Coordinate spaces (macOS; verified against tao-0.35.3 / dpi-0.1.2)
//!
//! - `cursor_position()` = `NSEvent.mouseLocation` (points, top-left origin)
//!   **times the primary display's scale** — only the primary scale undoes it.
//! - `Monitor::position()/size()` = `CGDisplayBounds` (points) **times that
//!   monitor's own scale** — a different multiplier than the cursor's on a
//!   mixed-DPI setup, so subtracting raw monitor values from a raw cursor
//!   value is wrong.
//! - `monitor_from_point` matches against `CGDisplayBounds` (points), so it
//!   must receive points.
//! - `set_position`/`set_size` scale by the window's **current** display's
//!   factor, so they must receive logical (point) values; physical values
//!   double-scale when the window still sits on a different-DPI display.
//!
//! The pipeline converts everything to desktop **points** (logical, top-left
//! origin) and never divides again:
//!
//! ```text
//! cursor_pts   = cursor_physical / primary_scale
//! target       = first monitor whose (physical / own_scale) contains cursor_pts
//! overlay_pts  = target_physical / target_scale
//! local        = cursor_pts - overlay_origin_pts
//! ```
//!
//! The pure core takes plain structs so tests pin exact single-/multi-monitor
//! and mixed-DPI geometries without a window system.

/// Monitor geometry in **physical pixels**, exactly as tao's monitor API
/// reports it: `CGDisplayBounds` (points) × this monitor's own `scale_factor`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MonitorGeom {
    pub pos_x: f64,
    pub pos_y: f64,
    pub width: f64,
    pub height: f64,
    pub scale: f64,
}

/// Result of picking the display under the cursor: overlay rect and the
/// cursor's position inside it, all in desktop **points**.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placement {
    pub origin_x: f64,
    pub origin_y: f64,
    pub width: f64,
    pub height: f64,
    /// Cursor relative to the overlay top-left. This is WebView space (the
    /// frontend sizes itself from `window.innerWidth/innerHeight`, already
    /// logical) — no further scale division, unlike the old
    /// `(cursor - origin) / scale_factor` which divided by the **window's**
    /// scale and drifted on mixed-DPI setups.
    pub cursor_x: f64,
    pub cursor_y: f64,
}

/// Monitor rectangle in point space. This is where the "each monitor's own
/// scale" distinction lives: dividing `CGDisplayBounds × own_scale` back by
/// `own_scale` recovers the points the OS bounds comparison is in.
fn logical_rect(m: MonitorGeom) -> (f64, f64, f64, f64) {
    let scale = if m.scale > 0.0 { m.scale } else { 1.0 };
    (
        m.pos_x / scale,
        m.pos_y / scale,
        m.width / scale,
        m.height / scale,
    )
}

/// Convert a raw `cursor_position()` value (physical, primary-scaled) into
/// desktop points. `primary_scale` is the **primary** display's scale — the
/// cursor's origin is expressed in it, and every monitor's rect is in the same
/// single global point space afterwards.
pub fn cursor_to_points(x_physical: f64, y_physical: f64, primary_scale: f64) -> (f64, f64) {
    let scale = if primary_scale > 0.0 {
        primary_scale
    } else {
        1.0
    };
    (x_physical / scale, y_physical / scale)
}

/// Pick the monitor under a point-space cursor. The cursor can sit off the
/// desktop or in the gap between displays (e.g. the menu bar's desktop patch),
/// so no rect containing it falls back to the primary display. Returns `None`
/// only when `monitors` is empty.
pub fn pick_monitor(
    cursor_pts_x: f64,
    cursor_pts_y: f64,
    monitors: &[MonitorGeom],
    primary_index: usize,
) -> Option<MonitorGeom> {
    let direct = monitors.iter().copied().find(|m| {
        let (x, y, w, h) = logical_rect(*m);
        cursor_pts_x >= x && cursor_pts_x < x + w && cursor_pts_y >= y && cursor_pts_y < y + h
    });
    direct
        .or_else(|| monitors.get(primary_index).copied())
        .or_else(|| monitors.first().copied())
}

/// Full pure pipeline: raw physical cursor (`cursor_position()`, primary
/// scaled), monitor universe in physical form, and the primary's index in it →
/// placement in points. `None` only when no monitor exists.
pub fn resolve_placement(
    cursor_x_physical: f64,
    cursor_y_physical: f64,
    primary_scale: f64,
    monitors: &[MonitorGeom],
    primary_index: usize,
) -> Option<Placement> {
    let (cx, cy) = cursor_to_points(cursor_x_physical, cursor_y_physical, primary_scale);
    let target = pick_monitor(cx, cy, monitors, primary_index)?;
    let (ox, oy, w, h) = logical_rect(target);
    Some(Placement {
        origin_x: ox,
        origin_y: oy,
        width: w,
        height: h,
        cursor_x: cx - ox,
        cursor_y: cy - oy,
    })
}

/// Cursor position as desktop **points** — the space `app_under_cursor`
/// (kCGWindowBounds) lives in, and the space other placement math must match.
/// `None` when the window or OS queries fail.
pub fn cursor_in_points(window: &tauri::WebviewWindow) -> Option<(f64, f64)> {
    let cursor = window.cursor_position().ok()?;
    let primary_scale = window
        .primary_monitor()
        .ok()?
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);
    Some(cursor_to_points(cursor.x, cursor.y, primary_scale))
}

/// Resolve and apply full-screen overlay geometry over the cursor's display.
///
/// Must be called **before each `show()`**, unconditionally — no "already on
/// the right monitor" fast path, because the frontend's macro-failure recovery
/// shrinks the overlay to 300x110 and the window may be killed before it
/// restores; only an unconditional reset guarantees the next show starts
/// full-screen.
///
/// `Ok(Some(placement))` = geometry applied; `Ok(None)` = no monitor
/// resolvable, previous geometry kept (never destroy a working overlay for a
/// guess); `Err` = the window/OS queries themselves failed (caller surfaces
/// it, not swallowed).
///
/// Every `set_*` receives **logical** values: `set_position`/`set_size` scale
/// by the window's current display factor, so physical values would be
/// off-by-scale when the cursor is on a different-DPI display.
#[cfg(target_os = "macos")]
pub fn wrap_overlay(window: &tauri::WebviewWindow) -> Result<Option<Placement>, String> {
    let cursor = window
        .cursor_position()
        .map_err(|e| format!("cursor_position failed: {e}"))?;
    let monitors_raw = window
        .available_monitors()
        .map_err(|e| format!("available_monitors failed: {e}"))?;
    let primary = window
        .primary_monitor()
        .map_err(|e| format!("primary_monitor failed: {e}"))?;

    let primary_scale = primary.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
    let monitors: Vec<MonitorGeom> = monitors_raw
        .iter()
        .map(|m| MonitorGeom {
            pos_x: m.position().x as f64,
            pos_y: m.position().y as f64,
            width: m.size().width as f64,
            height: m.size().height as f64,
            scale: m.scale_factor(),
        })
        .collect();

    // Identify the primary inside the universe by geometry: tao has no
    // is_primary flag on Monitor, and both values come from the same CGDisplay
    // so equality is exact. Index 0 keeps a fallback when it cannot be found.
    let primary_index = primary
        .as_ref()
        .and_then(|p| {
            monitors.iter().position(|m| {
                (m.pos_x - p.position().x as f64).abs() < f64::EPSILON
                    && (m.pos_y - p.position().y as f64).abs() < f64::EPSILON
                    && (m.width - p.size().width as f64).abs() < f64::EPSILON
                    && (m.height - p.size().height as f64).abs() < f64::EPSILON
                    && (m.scale - p.scale_factor()).abs() < f64::EPSILON
            })
        })
        .unwrap_or(0);

    let Some(placement) =
        resolve_placement(cursor.x, cursor.y, primary_scale, &monitors, primary_index)
    else {
        return Ok(None);
    };

    window
        .set_position(tauri::LogicalPosition::new(
            placement.origin_x,
            placement.origin_y,
        ))
        .map_err(|e| format!("set_position failed: {e}"))?;
    window
        .set_size(tauri::LogicalSize::new(placement.width, placement.height))
        .map_err(|e| format!("set_size failed: {e}"))?;
    Ok(Some(placement))
}

/// Build the `spawn-whip` payload with the cursor's overlay-local coordinates.
///
/// `placement` is the value returned by [`resolve_placement`] (or whoever
/// applied it, e.g. [`wrap_overlay`]); it passes the **cursor position** in
/// and computes `local = cursor_pts - overlay_origin_pts` in the same point
/// space. When coordinates cannot be resolved they are omitted and the overlay
/// falls back to its centre.
pub fn spawn_whip_payload(
    window: &tauri::WebviewWindow,
    force_full: bool,
    placement: Option<Placement>,
) -> serde_json::Value {
    let mut payload = serde_json::json!({ "forceFull": force_full });
    let (Some(placement), Some((cx, cy))) = (placement, cursor_in_points(window)) else {
        return payload;
    };
    payload["x"] = serde_json::json!(cx - placement.origin_x);
    payload["y"] = serde_json::json!(cy - placement.origin_y);
    payload
}
