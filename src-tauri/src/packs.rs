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

/// 运动轨迹特效预设 id（与 TS `EFFECT_PRESET_IDS` 保持一致）。
pub const EFFECT_PRESETS: &[&str] = &[
    "jet", "rise", "bolt", "wave", "orbit", "dash", "shatter", "burst",
    "flame-rise", "shatter-ice", "shock-ring", "water-splash", "whirl",
    "star-burst", "impact", "comet", "trail-burst", "pulse", "ring",
    "petal", "echo", "arc", "spiral", "split", "chain", "glow",
    "twinkle", "vortex", "rain", "explode",
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
    pub filter: Option<SoundFilter>,
    pub osc: Option<SoundOsc>,
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
        if self.id.is_empty()
            || !self
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err(format!("invalid pack id: {}", self.id));
        }
        if self.name.is_empty() || self.name.len() > 40 {
            return Err("pack name must be 1-40 chars".into());
        }
        if !EFFECT_PRESETS.contains(&self.effect.preset.as_str()) {
            return Err(format!("unknown effect preset: {}", self.effect.preset));
        }
        if self.sound.layers.is_empty() || self.sound.layers.len() > 6 {
            return Err("sound recipe must have 1-6 layers".into());
        }
        for layer in &self.sound.layers {
            if !(0.0..=1.0).contains(&layer.gain) {
                return Err(format!("layer gain out of range: {}", layer.gain));
            }
        }
        if !(0..=359).contains(&self.palette.particle_hue) {
            return Err("particleHue out of range 0-359".into());
        }
        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_manifest() -> PackManifest {
        PackManifest {
            id: "rocket".into(),
            name: "火箭".into(),
            icon: "icon.svg".into(),
            effect: EffectSpec {
                preset: "jet".into(),
                params: HashMap::new(),
            },
            sound: SoundRecipe {
                layers: vec![SoundLayer {
                    layer_type: SoundLayerType::Noise,
                    attack: 0.01,
                    decay: 0.4,
                    gain: 0.6,
                    filter: None,
                    osc: None,
                    noise_color: Some(NoiseColor::White),
                    delay: 0.0,
                }],
                master_gain: 0.8,
            },
            palette: PackPalette {
                body_gradient: ["#FF4400".into(), "#FF6A00".into()],
                particle_hue: 24,
            },
        }
    }

    #[test]
    fn valid_manifest_passes() {
        assert!(valid_manifest().validate().is_ok());
    }

    #[test]
    fn unknown_effect_preset_fails() {
        let mut m = valid_manifest();
        m.effect.preset = "not-a-preset".into();
        assert!(m.validate().is_err());
    }

    #[test]
    fn empty_layers_fail() {
        let mut m = valid_manifest();
        m.sound.layers.clear();
        assert!(m.validate().is_err());
    }

    #[test]
    fn out_of_range_hue_fails() {
        let mut m = valid_manifest();
        m.palette.particle_hue = 400;
        assert!(m.validate().is_err());
    }

    #[test]
    fn scan_missing_dir_yields_nothing() {
        let packs = scan_packs_in(Path::new("/nonexistent/aispur/packs"), true);
        assert!(packs.is_empty());
    }

    #[test]
    fn serializes_camel_case() {
        let pack = MaterialPack {
            id: "test".into(),
            name: "测试".into(),
            builtin: true,
            image_file: "icon.svg".into(),
            data_uri: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=".into(),
            effect: EffectSpec {
                preset: "jet".into(),
                params: HashMap::new(),
            },
            sound: SoundRecipe {
                layers: vec![SoundLayer {
                    layer_type: SoundLayerType::Noise,
                    attack: 0.01,
                    decay: 0.4,
                    gain: 0.6,
                    filter: None,
                    osc: None,
                    noise_color: None,
                    delay: 0.0,
                }],
                master_gain: 0.8,
            },
            palette: PackPalette {
                body_gradient: ["#111111".into(), "#333333".into()],
                particle_hue: 200,
            },
        };
        let json = serde_json::to_value(&pack).unwrap();
        assert_eq!(json["imageFile"], "icon.svg");
        assert_eq!(json["effect"]["preset"], "jet");
        // f32 序列化有精度误差，近似比较。
        assert!((json["sound"]["masterGain"].as_f64().unwrap() - 0.8).abs() < 1e-6);
        assert_eq!(json["palette"]["particleHue"], 200);
        assert_eq!(json["builtin"], true);
    }
}
