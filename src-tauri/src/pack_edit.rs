//! 自定义素材包编辑（v3 单一主轴）—— update_custom_pack 命令层 + 合并逻辑。
//!
//! 拆出 `pack_commands.rs` 的编辑职责（该文件已 282 行，接近 300 行上限）。
//! 命令层只做路径解析与结果包装（R-ARCH-008）；字段合并与校验在 `apply_update`
//! （纯函数），磁盘落地在私有子模块 `pack_edit_fs`。核心入口 `update_pack_at`
//! 接受裸路径，测试无需 Tauri 运行时。
//!
//! 原子性策略：先验证、后写入 —— 合并后的清单先过 `validate()`，全部通过才
//! 开始落盘；资产经临时文件 + `rename` 覆盖，pack.json 经 `.tmp` + `rename`
//! 原子替换。磁盘上要么是完整旧包、要么是完整新包。

use crate::packs::{self, EffectSpec, PackManifest, PackPalette};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tauri::{AppHandle, Manager};

#[path = "pack_edit_fs.rs"]
mod disk;

/// 内置素材包 id（与 TS `BUILTIN_PACK_IDS`、`src-tauri/packs/<id>/` 一一对应）。
/// 自定义包一旦占用内置 id 就会在 `list_packs` 里遮蔽内置包，编辑更会让用户
/// 以为自己在改内置素材——两条路径都必须拒绝。
#[rustfmt::skip]
const BUILTIN_PACK_IDS: &[&str] = &[
    "rocket", "phoenix", "lightning", "dragon", "ninja-star", "katana",
    "crystal", "skull", "flame", "ice", "thunder", "water", "wind",
    "star", "moon", "sun", "meteor", "comet", "guitar", "drum",
    "bell", "harp", "trumpet", "bow", "shield", "axe", "spear",
    "bomb", "lotus", "aurora",
    "tornado", "downpour", "wildfire", "revolver", "glass-shot", "boxing-glove",
    "bullwhip", "piano", "saxophone", "vinyl", "fireworks", "black-hole",
];

fn is_builtin_pack_id(id: &str) -> bool {
    BUILTIN_PACK_IDS.contains(&id)
}

/// 路径穿越防护（共享工具）：要求 `target` 的规范路径位于 `dir` 之内。
/// 编辑（`update_pack_at`）与删除（`delete_pack_at`）两条路径共用同一份
/// canonicalize + starts_with 判断，杜绝两处实现漂移。
pub fn ensure_within(dir: &Path, target: &Path) -> Result<PathBuf, String> {
    let canonical_dir = fs::canonicalize(dir).map_err(|e| format!("路径解析失败: {e}"))?;
    let canonical_target = fs::canonicalize(target).map_err(|e| format!("路径解析失败: {e}"))?;
    if !canonical_target.starts_with(&canonical_dir) {
        return Err("拒绝访问自定义素材包目录之外的路径".to_string());
    }
    Ok(canonical_target)
}

fn user_custom_packs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let dir = app_data_dir.join("packs").join("custom");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create packs directory: {e}"))?;
    Ok(dir)
}

/// 素材包编辑字段：`None` = 沿用现有值。`id` 不在其中——它恒不可变。
#[derive(Default)]
pub struct PackEdit {
    pub name: Option<String>,
    pub icon_path: Option<String>,
    pub effect_preset: Option<String>,
    pub effect_params: Option<HashMap<String, f32>>,
    pub sound_path: Option<String>,
    pub palette: Option<PackPalette>,
}

/// 读取素材包目录下的 pack.json。
pub fn read_manifest(dir: &Path) -> Result<PackManifest, String> {
    let content = fs::read_to_string(dir.join("pack.json"))
        .map_err(|e| format!("读取 pack.json 失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析 pack.json 失败: {e}"))
}

/// 逐字段合并编辑并校验。纯函数，不做任何磁盘写入；校验失败时调用方直接返回，
/// 原有内容一个字节都不会被动过。
pub fn apply_update(existing: &PackManifest, edit: &PackEdit) -> Result<PackManifest, String> {
    let mut next = PackManifest {
        id: existing.id.clone(), // id 不可变
        name: edit.name.clone().unwrap_or_else(|| existing.name.clone()),
        icon: existing.icon.clone(),
        effect: EffectSpec {
            preset: edit
                .effect_preset
                .clone()
                .unwrap_or_else(|| existing.effect.preset.clone()),
            params: edit
                .effect_params
                .clone()
                .unwrap_or_else(|| existing.effect.params.clone()),
        },
        sound: existing.sound.clone(),
        palette: edit
            .palette
            .clone()
            .unwrap_or_else(|| existing.palette.clone()),
    };

    if let Some(path) = edit.icon_path.as_deref() {
        next.icon = disk::icon_file_name(Path::new(path))?;
    }
    if let Some(path) = edit.sound_path.as_deref() {
        next.sound = disk::sound_recipe_with_uploaded_sample(&next.sound, Path::new(path))?;
    }

    next.validate()?;
    Ok(next)
}

/// 编辑入口：拒绝内置/穿越 id → 读清单 → 合并校验 → 原子落盘。
/// `custom_dir` 由命令层从 `AppHandle` 解析；测试直接传临时目录。
pub fn update_pack_at(
    custom_dir: &Path,
    id: &str,
    edit: &PackEdit,
) -> Result<PackManifest, String> {
    if is_builtin_pack_id(id) {
        return Err(format!("内置素材包 '{id}' 不可编辑"));
    }
    let target_dir = custom_dir.join(id);
    if !target_dir.is_dir() {
        return Err(format!("素材包 '{id}' 不存在"));
    }
    // 路径穿越防护：id 形如 `../../skins` 时 canonicalize 后必然逃逸出 custom_dir。
    let canonical_target = ensure_within(custom_dir, &target_dir)?;

    let existing = read_manifest(&canonical_target)?;
    let next = apply_update(&existing, edit)?;
    disk::persist_update(&canonical_target, &existing, &next, edit)?;
    Ok(next)
}

/// 删除自定义包（含路径穿越防护），供 `pack_commands::delete_custom_pack` 复用。
pub fn delete_pack_at(custom_dir: &Path, id: &str) -> Result<PathBuf, String> {
    let target_dir = custom_dir.join(id);
    if !target_dir.exists() {
        return Err(format!("素材包 '{id}' 不存在"));
    }
    let canonical_target = ensure_within(custom_dir, &target_dir)?;
    fs::remove_dir_all(&canonical_target).map_err(|e| format!("删除素材包失败: {e}"))?;
    Ok(canonical_target)
}

/// 更新自定义素材包。`None` 字段沿用现有值；`id` 只用于定位，永不改写。
// Tauri 把每个 IPC 字段展开成独立参数；与 `create_custom_pack` 一致，
// 保持显式契约而不是藏进无类型 payload。
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn update_custom_pack(
    id: String,
    name: Option<String>,
    icon_path: Option<String>,
    effect_preset: Option<String>,
    effect_params: Option<HashMap<String, f32>>,
    sound_path: Option<String>,
    palette: Option<PackPalette>,
    app: AppHandle,
) -> Result<packs::MaterialPack, String> {
    let custom_dir = user_custom_packs_dir(&app)?;
    update_pack_at(
        &custom_dir,
        &id,
        &PackEdit {
            name,
            icon_path,
            effect_preset,
            effect_params,
            sound_path,
            palette,
        },
    )?;

    // 重新扫描，返回带 data URI 的完整素材包（与 `create_custom_pack` 末尾一致）。
    let updated = packs::scan_packs_in(&custom_dir, false)
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "素材包更新后未能解析".to_string())?;

    // 正在使用该包时通知 overlay 换装。同 id 内容变更也必须强制刷新——
    // overlay 的 `packListNeedsRefresh` 只在「id 不在缓存里」时重取，
    // 光靠它无法察觉同 id 的图标/音频/参数已经换了。
    if is_active_pack(&app, &id) {
        if let Some(window) = app.get_webview_window("overlay") {
            window
                .emit("pack-changed", serde_json::json!({ "packId": id }))
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(updated)
}

fn is_active_pack(app: &AppHandle, id: &str) -> bool {
    let Ok(config_dir) = app.path().app_config_dir() else {
        return false;
    };
    let Ok(config_path) = crate::config::config_file_in(&config_dir) else {
        return false;
    };
    crate::config::load_config(&config_path)
        .map(|config| config.active_pack_id == id)
        .unwrap_or(false)
}
