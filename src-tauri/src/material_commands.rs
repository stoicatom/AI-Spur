//! Tauri command layer for the material system.
//!
//! Split from `commands.rs` to keep both files under the 300-line budget
//! (CLAUDE.md §3). Pure scanning/mapping logic lives in `materials.rs`; this
//! module only resolves paths from Tauri, unwraps arguments, and wraps results
//! (R-ARCH-008). Persist → in-memory → emit ordering mirrors `activate_skin`
//! and `set_crack_sound`.

use crate::commands::AppState;
use crate::config;
use crate::materials::{self, Material, MaterialKind, MaterialManifest};
use crate::usage;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};

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

/// Accepted image extensions for a user-uploaded material.
fn is_supported_image_ext(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp")
}

#[tauri::command]
pub async fn list_materials(app: AppHandle) -> Result<Vec<Material>, String> {
    let builtin = builtin_materials_dir(&app);
    let user = user_custom_materials_dir(&app).ok();
    Ok(materials::list_materials(&builtin, user.as_deref()))
}

#[tauri::command]
pub async fn set_active_material(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Deprecated (v3): the material axis was merged into the material pack.
    // This is a compatibility shim mapping the old material id onto the pack id
    // (built-in material ids largely coincide with pack ids). The frontend
    // will call `set_active_pack` after the UI overhaul; this command stays
    // registered so a stale caller never 404s.
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

    if let Some(w) = app.get_webview_window("overlay") {
        w.emit("material-changed", serde_json::json!({ "materialId": id }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn upload_custom_material(
    source_path: String,
    app: AppHandle,
) -> Result<Material, String> {
    let src = PathBuf::from(&source_path);

    let ext = src
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if !is_supported_image_ext(&ext) {
        return Err("不支持的图片格式（仅 png/jpg/jpeg/gif/svg/webp）".to_string());
    }
    if !src.is_file() {
        return Err("所选源文件不存在".to_string());
    }

    // Derive a filesystem-safe slug (and display name) from the file stem.
    let stem = src
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let slug: String = stem
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-', "-");
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        return Err("素材名称无效".to_string());
    }

    let custom_dir = user_custom_materials_dir(&app)?;
    let target_dir = custom_dir.join(&slug);
    if target_dir.exists() {
        return Err(format!("素材 '{slug}' 已存在"));
    }

    let file_name = format!("{slug}.{ext}");
    fs::create_dir_all(&target_dir).map_err(|e| format!("创建素材目录失败: {e}"))?;

    // Copy the asset; roll back the directory on any failure so a partial
    // upload never leaves a manifest pointing at a missing file.
    if let Err(e) = fs::copy(&src, target_dir.join(&file_name)) {
        let _ = fs::remove_dir_all(&target_dir);
        return Err(format!("复制素材文件失败: {e}"));
    }

    let manifest = MaterialManifest {
        id: slug.clone(),
        name: stem.clone(),
        file: file_name.clone(),
    };
    match serde_json::to_string_pretty(&manifest) {
        Ok(json) => {
            if let Err(e) = fs::write(target_dir.join("manifest.json"), json) {
                let _ = fs::remove_dir_all(&target_dir);
                return Err(format!("写入素材元数据失败: {e}"));
            }
        }
        Err(e) => {
            let _ = fs::remove_dir_all(&target_dir);
            return Err(format!("序列化素材元数据失败: {e}"));
        }
    }

    let asset_path = target_dir.join(&file_name);
    let data_uri =
        materials::image_data_uri(&asset_path).ok_or_else(|| "读取已上传素材失败".to_string())?;
    Ok(Material {
        id: slug,
        name: stem,
        kind: MaterialKind::Image,
        builtin: false,
        image_file: file_name,
        data_uri,
    })
}

#[tauri::command]
pub async fn delete_custom_material(id: String, app: AppHandle) -> Result<(), String> {
    let custom_dir = user_custom_materials_dir(&app)?;
    let target = custom_dir.join(&id);

    if !target.exists() {
        return Err(format!("素材 '{id}' 不存在"));
    }

    // Path-traversal guard: an id like `../../skins` must not reach
    // `remove_dir_all`. Canonicalise both sides and require containment.
    let canonical_custom =
        fs::canonicalize(&custom_dir).map_err(|e| format!("路径解析失败: {e}"))?;
    let canonical_target = fs::canonicalize(&target).map_err(|e| format!("路径解析失败: {e}"))?;
    if !canonical_target.starts_with(&canonical_custom) {
        return Err("拒绝删除素材目录之外的路径".to_string());
    }

    fs::remove_dir_all(&canonical_target).map_err(|e| format!("删除素材失败: {e}"))?;
    Ok(())
}
