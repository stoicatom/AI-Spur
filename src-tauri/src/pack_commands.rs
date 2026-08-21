//! Tauri command layer for the material pack system (v3 single axis).
//!
//! Split from `commands.rs` to keep files under the 300-line budget
//! (CLAUDE.md §3). Pure scanning/parsing logic lives in `packs.rs`; this
//! module only resolves paths from Tauri, unwraps arguments, and wraps results
//! (R-ARCH-008). Persist → in-memory → emit ordering mirrors `activate_skin`.

use crate::commands::AppState;
use crate::config;
use crate::packs::{self, MaterialPack, PackManifest};
use crate::usage;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};

/// Bundled material packs: the Tauri resource dir in a packaged app, the
/// crate's own `packs/` folder under `tauri dev`. Mirrors `builtin_materials_dir`.
///
/// The resource dir is only trusted when it actually contains a valid pack
/// (an `<id>/pack.json` subdirectory). Under `tauri dev` the resource dir can
/// exist but hold a flattened/stale copy that scans to nothing, so we fall
/// back to the crate source `packs/`.
fn builtin_packs_dir(app: &AppHandle) -> PathBuf {
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("packs");

    #[cfg(not(debug_assertions))]
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("packs");
        if bundled.is_dir() && !packs::scan_packs_in(&bundled, true).is_empty() {
            return bundled;
        }
    }

    #[cfg(debug_assertions)]
    let _ = app;

    source
}

/// User-created material packs live in `app_data_dir()/packs/custom/`.
///
/// The directory is created on demand so the very first `list_packs` call
/// on a fresh install does not fail on a missing path.
fn user_custom_packs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let dir = app_data_dir.join("packs").join("custom");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create packs directory: {e}"))?;
    Ok(dir)
}

/// Accepted icon extensions for a user-uploaded material pack.
fn is_supported_icon_ext(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp")
}

#[tauri::command]
pub async fn list_packs(app: AppHandle) -> Result<Vec<MaterialPack>, String> {
    let builtin = builtin_packs_dir(&app);
    let user = user_custom_packs_dir(&app).ok();
    Ok(packs::list_packs(&builtin, user.as_deref()))
}

#[tauri::command]
pub async fn set_active_pack(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Persist before committing to in-memory state: a failed write must not
    // leave the running app ahead of the config file.
    let mut guard = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
    let mut updated = guard.clone();
    updated.active_pack_id = id.clone();
    config::save_config(&state.config_path, &updated).map_err(|e| e.to_string())?;
    *guard = updated.clone();
    drop(guard);

    usage::emit_config_updated(&app, &updated);

    // Notify the overlay so it can swap the pack (icon/effect/sound/palette)
    // without reload.
    if let Some(w) = app.get_webview_window("overlay") {
        w.emit("pack-changed", serde_json::json!({ "packId": id }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Create a custom material pack: copy the user's icon into
/// `app_data_dir()/packs/custom/<id>/icon.<ext>` and write a `pack.json` that
/// binds the chosen effect preset, the given sound recipe, and a palette.
///
/// The `id` is derived from the icon filename by the caller; this command
/// validates it and refuses collisions with built-in packs.
#[tauri::command]
pub async fn create_custom_pack(
    id: String,
    name: String,
    icon_path: String,
    effect_preset: String,
    sound: packs::SoundRecipe,
    palette: packs::PackPalette,
    app: AppHandle,
) -> Result<MaterialPack, String> {
    let slug = sanitize_slug(&id);
    if slug.is_empty() {
        return Err("素材包名称无效".to_string());
    }

    let src = PathBuf::from(&icon_path);
    let ext = src
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if !is_supported_icon_ext(&ext) {
        return Err("不支持的图标格式（仅 png/jpg/jpeg/gif/svg/webp）".to_string());
    }
    if !src.is_file() {
        return Err("所选图标文件不存在".to_string());
    }

    // The effect preset must be one the overlay knows how to play.
    if !packs::EFFECT_PRESETS.contains(&effect_preset.as_str()) {
        return Err(format!("未知特效预设: {effect_preset}"));
    }

    let file_name = format!("icon.{ext}");
    let manifest = PackManifest {
        id: slug.clone(),
        name,
        icon: file_name.clone(),
        effect: packs::EffectSpec {
            preset: effect_preset,
            params: Default::default(),
        },
        sound,
        palette,
    };
    // Validate before creating or copying into the pack directory. Scanning
    // validates too, but that happens after a failed upload could leave files.
    manifest
        .validate()
        .map_err(|error| format!("素材包参数无效: {error}"))?;

    let custom_dir = user_custom_packs_dir(&app)?;
    let target_dir = custom_dir.join(&slug);
    if target_dir.exists() {
        return Err(format!("素材包 '{slug}' 已存在"));
    }

    fs::create_dir_all(&target_dir).map_err(|e| format!("创建素材包目录失败: {e}"))?;

    // Copy the icon; roll back the directory on any failure so a partial
    // upload never leaves a manifest pointing at a missing file.
    if let Err(e) = fs::copy(&src, target_dir.join(&file_name)) {
        let _ = fs::remove_dir_all(&target_dir);
        return Err(format!("复制图标文件失败: {e}"));
    }

    // Write pack.json; roll back on failure.
    let json = match serde_json::to_string_pretty(&manifest) {
        Ok(j) => j,
        Err(e) => {
            let _ = fs::remove_dir_all(&target_dir);
            return Err(format!("序列化 pack.json 失败: {e}"));
        }
    };
    if let Err(e) = fs::write(target_dir.join("pack.json"), json) {
        let _ = fs::remove_dir_all(&target_dir);
        return Err(format!("写入 pack.json 失败: {e}"));
    }

    // Re-scan to resolve the data URI and return the ready pack.
    packs::scan_packs_in(&custom_dir, false)
        .into_iter()
        .find(|p| p.id == slug)
        .ok_or_else(|| "素材包创建后未能解析".to_string())
}

/// Delete a custom material pack (built-in packs are never deletable).
#[tauri::command]
pub async fn delete_custom_pack(id: String, app: AppHandle) -> Result<(), String> {
    let custom_dir = user_custom_packs_dir(&app)?;
    let target = custom_dir.join(&id);
    if !target.exists() {
        return Err(format!("素材包 '{id}' 不存在"));
    }
    fs::remove_dir_all(&target).map_err(|e| format!("删除素材包失败: {e}"))?;
    Ok(())
}

/// Build a filesystem-safe slug from an arbitrary id/name. Lowercases and
/// replaces non-alphanumeric chars with `-`.
fn sanitize_slug(raw: &str) -> String {
    let slug: String = raw
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-', "-");
    slug.trim_matches('-').to_string()
}
