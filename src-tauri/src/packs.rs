//! 素材包（Material Pack）模型 + 文件系统扫描 —— v3 三轴合一。
//!
//! 一个素材包 = 图标 + 运动轨迹特效预设 + 程序化合成声音配方 + 配色，
//! 取代旧的三轴解耦体系（配色皮肤 skins / 音效包 sounds / 素材 materials）。
//!
//! 磁盘布局（内置）：`packs/<id>/icon.<svg|png|...>` + `pack.json`
//! 磁盘布局（自定义）：`app_data_dir()/packs/custom/<id>/icon.<ext>` + `pack.json`
//!
//! 本模块保持纯函数：只解析 pack.json、扫描目录、内联图标 data URI。
//! 路径解析与 Tauri 接线在 `pack_commands.rs`（R-ARCH-008）。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[path = "packs_validation.rs"]
mod validation;

/// 运动轨迹特效预设 id（与 TS `EFFECT_PRESET_IDS` 保持一致）。
pub const EFFECT_PRESETS: &[&str] = &[
    "jet",
    "rise",
    "bolt",
    "wave",
    "orbit",
    "dash",
    "shatter",
    "burst",
    "flame-rise",
    "shatter-ice",
    "shock-ring",
    "water-splash",
    "whirl",
    "star-burst",
    "impact",
    "comet",
    "trail-burst",
    "pulse",
    "ring",
    "petal",
    "echo",
    "arc",
    "spiral",
    "split",
    "chain",
    "glow",
    "twinkle",
    "vortex",
    "rain",
    "explode",
    "tornado",
    "downpour",
    "wildfire",
    "gunshot",
    "glass-break",
    "boxing",
    "whip-crack",
    "note-dance",
    "groove",
    "fireworks",
    "singularity",
    "drum-beat",
];

/// 声音层类型（与 TS `SoundLayerTypeSchema` 保持一致）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SoundLayerType {
    Noise,
    Tone,
    Sweep,
    Impact,
    Chime,
    Rumble,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum OscillatorType {
    Sine,
    Square,
    Sawtooth,
    Triangle,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FilterType {
    Lowpass,
    Highpass,
    Bandpass,
    Notch,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum NoiseColor {
    White,
    Pink,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SoundLayer {
    #[serde(rename = "type")]
    pub layer_type: SoundLayerType,
    pub attack: f32,
    pub decay: f32,
    pub gain: f32,
    #[serde(default)]
    pub filter: Option<SoundFilter>,
    #[serde(default)]
    pub osc: Option<SoundOsc>,
    #[serde(default)]
    pub noise_color: Option<NoiseColor>,
    #[serde(default)]
    pub delay: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SoundFilter {
    #[serde(rename = "type")]
    pub filter_type: FilterType,
    pub freq: f32,
    #[serde(default)]
    pub freq_end: Option<f32>,
    #[serde(default = "default_q")]
    pub q: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SoundOsc {
    #[serde(rename = "type")]
    pub osc_type: OscillatorType,
    pub freq: f32,
    #[serde(default)]
    pub freq_end: Option<f32>,
}

fn default_q() -> f32 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SoundRecipe {
    pub layers: Vec<SoundLayer>,
    #[serde(default = "default_master_gain")]
    pub master_gain: f32,
}

fn default_master_gain() -> f32 {
    0.8
}

/// 素材包本身。字段与 TS `MaterialPackSchema` 保持 camelCase 一致。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MaterialPack {
    pub id: String,
    pub name: String,
    pub builtin: bool,
    pub image_file: String,
    pub data_uri: String,
    pub effect: EffectSpec,
    pub sound: SoundRecipe,
    pub palette: PackPalette,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EffectSpec {
    pub preset: String,
    #[serde(default)]
    pub params: HashMap<String, f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PackPalette {
    pub body_gradient: [String; 2],
    pub particle_hue: i32,
}

/// 磁盘上的 `pack.json`（素材包目录内的元数据）。
/// `icon` 字段是图标文件名；`sound` / `effect` / `palette` 内联。
/// 允许 `builtin` 缺省（内置素材包可省略，扫描时按来源填充）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackManifest {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub effect: EffectSpec,
    pub sound: SoundRecipe,
    pub palette: PackPalette,
}

impl PackManifest {
    /// 校验必需字段与取值范围。
    pub fn validate(&self) -> Result<(), String> {
        validation::validate(self)
    }
}

/// 扫描单个目录下的素材包子目录（每个 `<id>/pack.json`）。
/// 无效素材包跳过并告警，不阻断整个扫描。
pub fn scan_packs_in(dir: &Path, builtin: bool) -> Vec<MaterialPack> {
    let mut packs = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return packs;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            match parse_pack(&path, builtin) {
                Some(p) => packs.push(p),
                None => eprintln!("[packs] skipping {}: invalid pack.json", path.display()),
            }
        }
    }
    packs
}

/// 从目录解析一个素材包：读取 `pack.json`，内联图标 data URI。
fn parse_pack(dir: &Path, builtin: bool) -> Option<MaterialPack> {
    let content = std::fs::read_to_string(dir.join("pack.json")).ok()?;
    let manifest: PackManifest = serde_json::from_str(&content).ok()?;
    manifest.validate().ok()?;

    let asset_path = dir.join(&manifest.icon);
    if !asset_path.is_file() {
        return None;
    }
    let bytes = std::fs::read(&asset_path).ok()?;
    let mime = match asset_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        _ => "application/octet-stream",
    };
    let data_uri = format!(
        "data:{mime};base64,{}",
        crate::sounds::base64_encode(&bytes)
    );

    Some(MaterialPack {
        id: manifest.id,
        name: manifest.name,
        builtin,
        image_file: manifest.icon,
        data_uri,
        effect: manifest.effect,
        sound: manifest.sound,
        palette: manifest.palette,
    })
}

/// 列出全部可用素材包：内置 + 用户自定义。用户包 id 与内置冲突时覆盖内置。
pub fn list_packs(builtin_dir: &Path, user_dir: Option<&Path>) -> Vec<MaterialPack> {
    let mut packs = scan_packs_in(builtin_dir, true);
    if let Some(user_dir) = user_dir {
        for user_pack in scan_packs_in(user_dir, false) {
            match packs.iter().position(|p| p.id == user_pack.id) {
                Some(i) => packs[i] = user_pack,
                None => packs.push(user_pack),
            }
        }
    }
    packs
}
