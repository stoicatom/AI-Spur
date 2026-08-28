//! `pack_edit` 的磁盘落地半边：资产暂存、原子替换、旧资产清理。
//!
//! 拆自 `pack_edit.rs` 以守住 300 行上限（CLAUDE.md §3），沿用 `packs.rs`
//! 通过 `#[path]` 引入 `packs_validation.rs` 的同款私有子模块范式。
//!
//! 原子性：所有新资产先写成 `<最终名>.new`，pack.json 先写 `pack.json.tmp`，
//! 全部就位后统一 `rename` 提交（同一文件系统内原子）。任一 rename 失败即
//! 清理全部临时文件并返回错误——磁盘上要么是完整旧包、要么是完整新包。

use super::{PackEdit, packs};
use packs::{PackManifest, SoundRecipe};
use std::fs;
use std::path::{Path, PathBuf};

/// 落盘：资产（临时文件 + rename 覆盖、扩展名变化删除旧文件）→ pack.json 原子替换。
pub(super) fn persist_update(
    target_dir: &Path,
    existing: &PackManifest,
    next: &PackManifest,
    edit: &PackEdit,
) -> Result<(), String> {
    let mut staged: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut removals: Vec<PathBuf> = Vec::new();

    stage_asset(
        target_dir,
        edit.icon_path.as_deref(),
        &existing.icon,
        &next.icon,
        &mut staged,
        &mut removals,
    )?;
    let existing_sound = existing.sound.sample.as_ref().map(|s| s.file.as_str());
    let next_sound = next.sound.sample.as_ref().map(|s| s.file.as_str());
    stage_asset(
        target_dir,
        edit.sound_path.as_deref(),
        existing_sound.unwrap_or_default(),
        next_sound.unwrap_or_default(),
        &mut staged,
        &mut removals,
    )?;

    // 资产全部就位（或未变更）后，序列化并原子替换 pack.json。
    let json =
        serde_json::to_string_pretty(next).map_err(|e| format!("序列化 pack.json 失败: {e}"))?;
    let tmp_json = target_dir.join("pack.json.tmp");
    if let Err(e) = fs::write(&tmp_json, &json) {
        cleanup(&staged);
        return Err(format!("写入 pack.json 失败: {e}"));
    }
    staged.push((tmp_json, target_dir.join("pack.json")));

    for (tmp, final_path) in &staged {
        if let Err(e) = fs::rename(tmp, final_path) {
            cleanup(&staged);
            return Err(format!("替换文件失败: {e}"));
        }
    }

    // 扩展名变化时清理旧资产：icon.png → icon.svg 必须删掉 icon.png，
    // 否则目录里留下永远无人引用的孤儿文件。清理失败无害，不回滚。
    for removal in &removals {
        if removal.is_file() {
            let _ = fs::remove_file(removal);
        }
    }
    Ok(())
}

/// 把源资产复制成临时文件；扩展名变化时登记删除旧文件。
fn stage_asset(
    target_dir: &Path,
    source: Option<&str>,
    existing_file: &str,
    next_file: &str,
    staged: &mut Vec<(PathBuf, PathBuf)>,
    removals: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let Some(source) = source else {
        return Ok(()); // 未重选 = 沿用现有资产，一个字节都不碰
    };
    let tmp = target_dir.join(format!("{next_file}.new"));
    if let Err(e) = fs::copy(PathBuf::from(source), &tmp) {
        cleanup(staged);
        return Err(format!("复制素材文件失败: {e}"));
    }
    staged.push((tmp, target_dir.join(next_file)));
    if !existing_file.is_empty() && existing_file != next_file {
        removals.push(target_dir.join(existing_file));
    }
    Ok(())
}

fn cleanup(staged: &[(PathBuf, PathBuf)]) {
    for (tmp, _) in staged {
        let _ = fs::remove_file(tmp);
    }
}

/// 校验并推导上传图标在包内的文件名（`icon.<ext>`）。
pub(super) fn icon_file_name(src: &Path) -> Result<String, String> {
    let ext = lower_ext(src);
    if !matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp"
    ) {
        return Err("不支持的图标格式（仅 png/jpg/jpeg/gif/svg/webp）".to_string());
    }
    if !src.is_file() {
        return Err("所选图标文件不存在".to_string());
    }
    Ok(format!("icon.{ext}"))
}

/// 用新上传的录音替换 sample，保留其余配方字段（masterGain / 兼容 layers）。
pub(super) fn sound_recipe_with_uploaded_sample(
    current: &SoundRecipe,
    src: &Path,
) -> Result<SoundRecipe, String> {
    let ext = lower_ext(src);
    if !matches!(ext.as_str(), "wav" | "mp3" | "m4a" | "aac" | "ogg" | "oga") {
        return Err("不支持的音频格式（仅 wav/mp3/m4a/aac/ogg）".to_string());
    }
    if !src.is_file() {
        return Err("所选音频文件不存在".to_string());
    }
    let mut next = current.clone();
    next.sample = Some(packs::SoundSample {
        file: format!("sound.{ext}"),
        data_uri: None,
        gain: 0.82,
        max_duration: 8.0,
        source_title: src
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "用户上传录音".into()),
        source_url: "https://local.user-upload.invalid/recording".into(),
        license: "用户自有素材".into(),
    });
    Ok(next)
}

fn lower_ext(path: &Path) -> String {
    path.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}
