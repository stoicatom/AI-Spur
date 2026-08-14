//! Tauri command layer for the sound preset system.
//!
//! Split from `commands.rs` to keep both files under the 300-line budget
//! (CLAUDE.md §3). Pure scanning/parsing logic lives in `sounds.rs`; this
//! module only unwraps arguments, resolves paths from Tauri, and wraps results
//! (R-ARCH-008).

use crate::commands::AppState;
use crate::config;
use crate::sounds::{self, SoundPreset, SoundPresetMeta};
use crate::usage;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

/// User sound packs live in `app_data_dir()/sounds/custom/`.
///
/// The directory is created on demand so the very first `list_sound_presets`
/// call on a fresh install does not fail on a missing path.
fn user_custom_sounds_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let dir = app_data_dir.join("sounds").join("custom");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create sounds directory: {e}"))?;
    Ok(dir)
}

/// Bundled sound packs: the Tauri resource dir in a packaged app, the repo's
/// own `sounds/` folder under `tauri dev`.
///
/// The resource dir is trusted only when it still holds real preset audio (a
/// non-default pack like `rocket`/`lightning`). Under `tauri dev` it can be a
/// flattened/stale copy, so we fall back to the repo-root `sounds/`, whose
/// per-preset layout is authoritative.
fn builtin_sounds_dir(app: &AppHandle) -> PathBuf {
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("sounds");

    // Dev: the source tree is authoritative (target/debug accumulates stale
    // copies that are never pruned — same issue as materials). Packaged builds
    // read the bundled resource dir when it holds real preset audio.
    #[cfg(not(debug_assertions))]
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("sounds");
        // "default" carries no files, so presence alone is not enough — require
        // at least one *non-default* preset to have resolved files.
        if bundled.is_dir()
            && sounds::builtin_presets(&bundled)
                .iter()
                .any(|p| p.id != "default" && !p.files.is_empty())
        {
            return bundled;
        }
    }

    #[cfg(debug_assertions)]
    let _ = app;

    source
}

#[tauri::command]
pub async fn list_sound_presets(app: AppHandle) -> Result<Vec<SoundPreset>, String> {
    let builtin = builtin_sounds_dir(&app);
    let custom = user_custom_sounds_dir(&app)?;

    let mut presets = sounds::builtin_presets(&builtin);
    presets.extend(sounds::user_presets(&custom));
    Ok(presets)
}

/// Read one preset's audio file and return it as a `data:` URI for playback.
///
/// Used by the settings preview button and the overlay. Going through Rust
/// sidesteps the asset-protocol path ambiguity that left the sound files
/// unreachable in dev (same fix as materials). `preset_id == "default"` (or a
/// preset with no folder of its own) resolves against the skin-level sounds at
/// the bundled `sounds/` root.
///
/// A path-traversal guard rejects any `file` that escapes the resolved preset
/// directory.
#[tauri::command]
pub async fn read_sound_data(
    preset_id: String,
    file: String,
    app: AppHandle,
) -> Result<String, String> {
    let builtin_root = builtin_sounds_dir(&app);

    // Resolve the directory the file should live in.
    let dir = if preset_id == "default" {
        builtin_root.clone()
    } else if sounds::builtin_presets(&builtin_root)
        .iter()
        .any(|p| p.id == preset_id)
    {
        builtin_root.join(&preset_id)
    } else {
        user_custom_sounds_dir(&app)?.join(&preset_id)
    };

    let target = dir.join(&file);

    // Path-traversal guard: `file` must resolve inside `dir`.
    let canon_dir = fs::canonicalize(&dir).map_err(|e| format!("路径解析失败: {e}"))?;
    let canon_target = fs::canonicalize(&target).map_err(|_| "音频文件不存在".to_string())?;
    if !canon_target.starts_with(&canon_dir) {
        return Err("拒绝读取音效目录之外的文件".to_string());
    }

    sounds::audio_data_uri(&canon_target).ok_or_else(|| "读取音频文件失败".to_string())
}

#[tauri::command]
pub async fn set_crack_sound(
    preset_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Persist before committing to in-memory state, matching `activate_skin`:
    // a failed write must not leave the running app ahead of the config file.
    let mut guard = state
        .config
        .lock()
        .map_err(|_| "Internal state error: config lock poisoned".to_string())?;
    let mut updated = guard.clone();
    updated.crack_sound_id = preset_id;
    config::save_config(&state.config_path, &updated).map_err(|e| e.to_string())?;
    *guard = updated.clone();
    drop(guard);

    usage::emit_config_updated(&app, &updated);
    Ok(())
}

#[tauri::command]
pub async fn upload_custom_sound(
    source_dir: String,
    pack_name: String,
    app: AppHandle,
) -> Result<SoundPreset, String> {
    let custom_dir = user_custom_sounds_dir(&app)?;

    // Slugify the display name into a filesystem-safe id.
    let pack_id: String = pack_name
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-', "-");
    let pack_id = pack_id.trim_matches('-').to_string();

    if pack_id.is_empty() {
        return Err("音效包名称无效".to_string());
    }

    let target_dir = custom_dir.join(&pack_id);
    if target_dir.exists() {
        return Err(format!("音效包 '{pack_id}' 已存在"));
    }

    // Read the source listing before creating anything, so an empty pick
    // leaves no orphan directory behind.
    let files = sounds::collect_audio_files(Path::new(&source_dir));
    if files.is_empty() {
        return Err("所选文件夹中没有可用的音频文件（mp3/wav/ogg）".to_string());
    }

    fs::create_dir_all(&target_dir).map_err(|e| format!("创建音效包目录失败: {e}"))?;

    for file_name in &files {
        let src = Path::new(&source_dir).join(file_name);
        let dst = target_dir.join(file_name);
        if let Err(e) = fs::copy(&src, &dst) {
            // Roll back a partial copy: a half-written pack would list files
            // that the overlay then fails to play.
            let _ = fs::remove_dir_all(&target_dir);
            return Err(format!("复制 {file_name} 失败: {e}"));
        }
    }

    let meta = SoundPresetMeta {
        id: pack_id.clone(),
        name: pack_name,
    };
    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| format!("序列化失败: {e}"))?;
    if let Err(e) = fs::write(target_dir.join("preset.json"), meta_json) {
        let _ = fs::remove_dir_all(&target_dir);
        return Err(format!("写入音效包元数据失败: {e}"));
    }

    Ok(SoundPreset {
        id: pack_id,
        name: meta.name,
        is_builtin: false,
        files,
    })
}

#[tauri::command]
pub async fn delete_custom_sound(preset_id: String, app: AppHandle) -> Result<(), String> {
    let custom_dir = user_custom_sounds_dir(&app)?;
    let target = custom_dir.join(&preset_id);

    if !target.exists() {
        return Err(format!("音效包 '{preset_id}' 不存在"));
    }

    // Path-traversal guard: an id like `../../skins` must not reach
    // `remove_dir_all`. Canonicalise both sides and require containment.
    let canonical_custom =
        fs::canonicalize(&custom_dir).map_err(|e| format!("路径解析失败: {e}"))?;
    let canonical_target = fs::canonicalize(&target).map_err(|e| format!("路径解析失败: {e}"))?;
    if !canonical_target.starts_with(&canonical_custom) {
        return Err("拒绝删除音效目录之外的路径".to_string());
    }

    fs::remove_dir_all(&canonical_target).map_err(|e| format!("删除音效包失败: {e}"))?;
    Ok(())
}
