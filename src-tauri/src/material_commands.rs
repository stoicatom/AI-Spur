//! Tauri command layer for the material system.
//!
//! Split from `commands.rs` to keep both files under the 300-line budget
//! (CLAUDE.md §3). Pure scanning/mapping logic lives in `materials.rs`; this
//! module only resolves paths from Tauri, unwraps arguments, and wraps results
//! (R-ARCH-008).
//!
//! Only `list_materials` remains: the material axis was merged into the
//! material pack (v3), so activation and upload/delete now live in
//! `pack_commands.rs` / `pack_edit.rs`. The overlay still calls
//! `list_materials` as a legacy fallback when a pack carries no image.

use crate::materials::{self, Material};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Bundled image materials: the Tauri resource dir in a packaged app, the
/// crate's own `materials/` folder under `tauri dev`. Mirrors `builtin_skins_dir`.
///
/// The resource dir is only trusted when it actually contains a valid material
/// (an `<id>/manifest.json` subdirectory). Under `tauri dev` the resource dir
/// can exist but hold a flattened/stale copy that scans to nothing, so we fall
/// back to the crate source `materials/`, whose per-id subdirectory layout is
/// always authoritative.
fn builtin_materials_dir(app: &AppHandle) -> PathBuf {
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("materials");

    // In dev the source tree is authoritative: Tauri copies `resources` into
    // target/debug but never prunes them, so that copy accumulates every
    // material id from every past build (stale bolt/claw/collision, duplicates).
    // Reading the crate source avoids showing that history. Packaged builds use
    // the bundled resource dir, trusting it only when it scans to a material.
    #[cfg(not(debug_assertions))]
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("materials");
        if bundled.is_dir() && !materials::scan_image_materials(&bundled, true).is_empty() {
            return bundled;
        }
    }

    #[cfg(debug_assertions)]
    let _ = app;

    source
}

/// User-uploaded image materials live in `app_data_dir()/materials/custom/`.
///
/// The directory is created on demand so the very first `list_materials` call
/// on a fresh install does not fail on a missing path.
fn user_custom_materials_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let dir = app_data_dir.join("materials").join("custom");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create materials directory: {e}"))?;
    Ok(dir)
}

#[tauri::command]
pub async fn list_materials(app: AppHandle) -> Result<Vec<Material>, String> {
    let builtin = builtin_materials_dir(&app);
    let user = user_custom_materials_dir(&app).ok();
    Ok(materials::list_materials(&builtin, user.as_deref()))
}
