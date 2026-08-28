use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

// Note: These types and functions are not used in main.rs yet but will be
// consumed by Tauri command handlers in subsequent tasks (Task 1.3+).
#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Failed to read config file: {0}")]
    ReadError(String),
    #[error("Failed to parse config JSON: {0}")]
    ParseError(String),
    #[error("Failed to write config file: {0}")]
    WriteError(String),
    #[error("Unknown config version: {0}")]
    UnknownVersion(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AnimationMode {
    Standard,
    Fast,
    #[default]
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    Auto,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum WindowPresence {
    /// Keep AISpur tray-resident; closing settings hides the window and, on
    /// macOS, returns the process to accessory mode.
    #[default]
    Tray,
    /// Keep a normal Dock/taskbar entry so the settings window can be restored
    /// after it is closed (minimized on Windows/Linux, hidden on macOS).
    Persistent,
}

/// 当前配置 schema 版本。与 TS 端 `ConfigSchema.version`（`z.literal('4.0')`）
/// 逐字对齐：任何迁移路径的产物都必须写成这个值，否则前端 Zod 会拒绝整份配置。
pub const CURRENT_VERSION: &str = "4.0";

/// 特效画质档位（CG 场景基座）。默认 `Auto` = 运行时按实测帧耗时自适应升降档
/// （最流畅优先）；其余四档由用户在设置页显式固定。序列化为小写字面量，与 TS 端
/// `EffectQualitySchema = z.enum(['auto','cinematic','high','medium','low'])` 一致。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum EffectQuality {
    Cinematic,
    High,
    Medium,
    Low,
    #[default]
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub version: String, // CURRENT_VERSION ("4.0")
    pub hotkey: String,
    pub phrases: Vec<String>,
    pub animation_mode: AnimationMode,
    pub auto_switch_threshold: u32,
    pub usage_count: u32,
    pub today_usage_count: u32,
    pub last_usage_date: Option<String>, // ISO 8601 date
    pub play_sound: bool,
    pub show_border_flash: bool,
    /// Multiplier on the crack speed threshold; 1.0 is the tuned baseline.
    /// Semantics: higher = easier to trigger a crack.
    pub crack_sensitivity: f32,
    pub theme: Theme,
    pub language: String, // "auto" | "zh-CN" | "en-US"
    pub first_launch: bool,
    #[serde(default)]
    pub window_presence: WindowPresence,
    /// ID of the active material pack (v3 single axis: icon + effect + sound + palette).
    /// Replaces v2's three-axis active_skin / crack_sound_id / active_material_id.
    /// Kept in sync with the TS `activePackId` (Zod `.default('rocket')`).
    #[serde(default = "default_active_pack_id")]
    pub active_pack_id: String,
    /// 特效画质档位（v4 新增）。缺省 `auto` = 运行时自适应；
    /// `#[serde(default)]` 让 v3 老配置缺这个键时也能解析出来。
    #[serde(default)]
    pub quality: EffectQuality,
}

fn default_active_pack_id() -> String {
    "rocket".to_string()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: CURRENT_VERSION.to_string(),
            hotkey: "CommandOrControl+Shift+W".to_string(),
            phrases: vec![
                "FASTER".to_string(),
                "KEEP GOING".to_string(),
                "DON'T STOP NOW".to_string(),
                "SHOW ME WHAT YOU GOT".to_string(),
            ],
            animation_mode: AnimationMode::Auto,
            auto_switch_threshold: 20,
            usage_count: 0,
            today_usage_count: 0,
            last_usage_date: None,
            play_sound: true,
            show_border_flash: true,
            crack_sensitivity: 1.0,
            theme: Theme::Auto,
            language: "auto".to_string(),
            first_launch: true,
            window_presence: WindowPresence::Tray,
            active_pack_id: "rocket".to_string(),
            quality: EffectQuality::Auto,
        }
    }
}

/// Resolve `dir/config.json`, creating `dir` if it does not exist yet.
///
/// The directory itself comes from Tauri's `app_config_dir()` (resolved in
/// `main.rs` at startup and stored on `AppState`) so the location always tracks
/// the bundle identifier instead of a hardcoded one (CLAUDE.md §4.3).
pub fn config_file_in(dir: &Path) -> Result<PathBuf, ConfigError> {
    fs::create_dir_all(dir).map_err(|e| ConfigError::WriteError(e.to_string()))?;
    Ok(dir.join("config.json"))
}

/// Pre-rename config location, back when the bundle identifier was
/// `com.openwhip.app`. Used once at startup to carry settings over to the
/// current `app_config_dir()`; see `migrate_legacy_config`.
pub fn legacy_config_file() -> Option<PathBuf> {
    let dir = if cfg!(target_os = "macos") {
        dirs::home_dir().map(|h| {
            h.join("Library")
                .join("Application Support")
                .join("com.openwhip.app")
        })
    } else if cfg!(target_os = "windows") {
        dirs::config_dir().map(|c| c.join("com.openwhip.app"))
    } else {
        dirs::config_dir().map(|c| c.join("openwhip"))
    };
    dir.map(|d| d.join("config.json"))
}

/// Copy a pre-rename config into `target` when the new location has no config
/// yet. The old file is left untouched: a failed launch on the new build must
/// not cost the user their settings.
///
/// Returns whether a copy happened. Errors are reported but never fatal —
/// worst case the user starts from defaults.
pub fn migrate_legacy_config(target: &Path) -> bool {
    if target.exists() {
        return false;
    }
    let Some(legacy) = legacy_config_file() else {
        return false;
    };
    if legacy == target || !legacy.exists() {
        return false;
    }
    match fs::copy(&legacy, target) {
        Ok(_) => {
            eprintln!(
                "[config] carried settings over from {} to {}",
                legacy.display(),
                target.display()
            );
            true
        }
        Err(e) => {
            eprintln!("[config] could not copy legacy config: {e}");
            false
        }
    }
}

pub fn load_config(path: &Path) -> Result<Config, ConfigError> {
    if !path.exists() {
        return Ok(Config::default());
    }
    let contents = fs::read_to_string(path).map_err(|e| ConfigError::ReadError(e.to_string()))?;
    let raw: serde_json::Value =
        serde_json::from_str(&contents).map_err(|e| ConfigError::ParseError(e.to_string()))?;
    migrate(raw)
}

/// Convert a raw config JSON value into the current `Config` schema.
///
/// Unknown versions are a hard error so a config written by a newer (or
/// corrupted) build is never silently half-parsed into defaults — better to
/// surface the problem than to reset the user's settings (R-ARCH-010).
fn migrate(raw: serde_json::Value) -> Result<Config, ConfigError> {
    let version = raw.get("version").and_then(|v| v.as_str()).unwrap_or("1.0");

    let parsed = match version {
        "4.0" => parse_v4(raw),
        "3.0" => migrate_v3_to_v4(raw),
        // v2 先归一（activeMaterialId → activePackId），产物再过 v3→v4 补 quality，
        // 避免把同一段字段合并逻辑写两遍。
        "2.0" => migrate_v3_to_v4(migrate_v2_to_v3(raw)?),
        _ => Err(ConfigError::UnknownVersion(version.to_string())),
    }?;

    Ok(normalize_config(parsed))
}

/// Keep persisted configs inside the frontend contract's phrase invariant.
pub fn normalize_config(mut config: Config) -> Config {
    config.phrases.retain(|phrase| !phrase.is_empty());
    if config.phrases.is_empty() {
        config.phrases = Config::default().phrases;
    }
    config
}

/// 把 `raw` 中当前 schema 认识的键覆盖到 `Config::default()` 的序列化基底上。
///
/// 缺失键从默认值补齐：老版本配置缺新字段时（如 v3 文件没有 `quality`），serde 不会
/// 因此拒绝整份文件，用户拿到一个新默认值而非掉进错误态。陌生键被滤掉：过期字段
/// （activeSkin / crackSoundId 等）不进 serde。版本字符串仍由 `migrate` 硬校验——
/// 这里只宽容缺键，绝不宽容异构 schema。
fn merge_onto_defaults(raw: &serde_json::Value) -> Result<serde_json::Value, ConfigError> {
    let mut merged = serde_json::to_value(Config::default())
        .map_err(|e| ConfigError::ParseError(e.to_string()))?;

    if let (Some(base), Some(given)) = (merged.as_object_mut(), raw.as_object()) {
        for (key, value) in given {
            if base.contains_key(key) {
                base.insert(key.clone(), value.clone());
            }
        }
    }

    Ok(merged)
}

/// v2 → v3：三轴合一。把 v2 的 `activeMaterialId` 迁移为 v3 的 `activePackId`；
/// 其余字段原样带过（activeSkin / crackSoundId 弃用，不再保留）。返回的是中间态
/// JSON 而非 `Config`——调用方接着过 `migrate_v3_to_v4`，省掉一次多余的解析往返。
fn migrate_v2_to_v3(raw: serde_json::Value) -> Result<serde_json::Value, ConfigError> {
    let mut merged = merge_onto_defaults(&raw)?;

    // 迁移 activeMaterialId → activePackId（v3 单一选择轴）。
    if let Some(active_material) = raw.get("activeMaterialId").and_then(|v| v.as_str()) {
        if !active_material.is_empty() {
            merged["activePackId"] = serde_json::json!(active_material);
        }
    }

    // 无论 v2 原文件写什么，这一跳的产物一律标成 v3，交给下一跳继续迁移。
    merged["version"] = serde_json::json!("3.0");
    Ok(merged)
}

/// v3 → v4：新增 `quality` 画质档位，缺省 `auto`；其余字段原样带过。
///
/// 版本号归一化为 `CURRENT_VERSION`——TS 端 `ConfigSchema.version` 是
/// `z.literal('4.0')`，迁移产物若仍写 "3.0" 会被前端 Zod 整份拒绝。
fn migrate_v3_to_v4(raw: serde_json::Value) -> Result<Config, ConfigError> {
    // quality 的 auto 基底由 `Config::default()` 提供：v3 文件没有这个键，
    // 合并后自然落在 auto 上，无需在此显式写值。
    let mut merged = merge_onto_defaults(&raw)?;
    merged["version"] = serde_json::json!(CURRENT_VERSION);

    serde_json::from_value(merged).map_err(|e| ConfigError::ParseError(e.to_string()))
}

/// 解析 v4 配置，缺失键从 `Config::default()` 补齐（见 `merge_onto_defaults`）。
/// 与 v3 迁移路径同一段逻辑：输入版本号本已是 4.0，归一化那一步是幂等的。
fn parse_v4(raw: serde_json::Value) -> Result<Config, ConfigError> {
    migrate_v3_to_v4(raw)
}

pub fn save_config(path: &Path, config: &Config) -> Result<(), ConfigError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| ConfigError::WriteError(e.to_string()))?;
    }
    let json = serde_json::to_string_pretty(&normalize_config(config.clone()))
        .map_err(|e| ConfigError::WriteError(e.to_string()))?;
    fs::write(path, json).map_err(|e| ConfigError::WriteError(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrate_accepts_shortcut_config_raw() {
        // A config file written as JSON with version 1.0 should be rejected
        // (we do not have a v1 migration defined), but the error must name the
        // version rather than silently produce an empty default config.
        let raw = serde_json::json!({ "version": "1.0", "hotkey": "ctrl+w" });
        let err = migrate(raw).unwrap_err();
        assert!(matches!(err, ConfigError::UnknownVersion(v) if v == "1.0"));
    }

    #[test]
    fn migrate_accepts_current_v2() {
        let raw = serde_json::json!({
            "version": "2.0",
            "hotkey": "CommandOrControl+Shift+W",
            "phrases": ["FASTER"],
            "activeSkin": "default",
            "animationMode": "auto",
            "autoSwitchThreshold": 20,
            "usageCount": 0,
            "todayUsageCount": 0,
            "playSound": true,
            "showBorderFlash": true,
            "crackSensitivity": 1.0,
            "firstLaunch": true
        });
        let cfg = migrate(raw).unwrap();
        assert_eq!(cfg.version, CURRENT_VERSION); // 迁移链末端归一化为 v4
        assert_eq!(cfg.hotkey, "CommandOrControl+Shift+W");
        assert_eq!(cfg.active_pack_id, "rocket"); // default when no activeMaterialId
    }

    #[test]
    fn migrate_v2_to_v3_maps_active_material_to_pack() {
        // The core v2→v3 migration: activeMaterialId becomes activePackId.
        let raw = serde_json::json!({
            "version": "2.0",
            "hotkey": "CommandOrControl+Shift+W",
            "phrases": ["FASTER"],
            "activeSkin": "default",
            "animationMode": "auto",
            "autoSwitchThreshold": 20,
            "usageCount": 7,
            "todayUsageCount": 3,
            "playSound": true,
            "showBorderFlash": true,
            "crackSensitivity": 1.0,
            "firstLaunch": false,
            "activeMaterialId": "lightning",
            "crackSoundId": "bomb"
        });
        let cfg = migrate(raw).unwrap();
        assert_eq!(cfg.version, CURRENT_VERSION);
        assert_eq!(cfg.active_pack_id, "lightning");
        assert_eq!(cfg.usage_count, 7);
        assert_eq!(cfg.today_usage_count, 3);
    }

    #[test]
    fn migrate_v2_to_v3_ignores_stale_axes() {
        // activeSkin / crackSoundId are dropped; only activeMaterialId survives
        // as the pack seed. The struct has no such fields at all.
        let raw = serde_json::json!({
            "version": "2.0",
            "hotkey": "CmdOrCtrl+W",
            "phrases": ["FASTER"],
            "activeSkin": "fire",
            "animationMode": "auto",
            "autoSwitchThreshold": 20,
            "usageCount": 1,
            "todayUsageCount": 1,
            "playSound": true,
            "showBorderFlash": true,
            "crackSensitivity": 1.0,
            "firstLaunch": false,
            "activeMaterialId": "meteor",
            "crackSoundId": "guitar"
        });
        let cfg = migrate(raw).unwrap();
        assert_eq!(cfg.active_pack_id, "meteor");
    }

    #[test]
    fn migrate_v2_missing_active_material_uses_default_pack() {
        let raw = serde_json::json!({
            "version": "2.0",
            "hotkey": "CmdOrCtrl+W",
            "phrases": ["FASTER"],
            "activeSkin": "default",
            "animationMode": "auto",
            "autoSwitchThreshold": 20,
            "usageCount": 0,
            "todayUsageCount": 0,
            "playSound": true,
            "showBorderFlash": true,
            "crackSensitivity": 1.0,
            "firstLaunch": false
        });
        let cfg = migrate(raw).unwrap();
        assert_eq!(cfg.active_pack_id, "rocket");
    }

    #[test]
    fn migrate_accepts_current_v3() {
        let raw = serde_json::json!({
            "version": "3.0",
            "hotkey": "CommandOrControl+Shift+W",
            "phrases": ["FASTER"],
            "animationMode": "auto",
            "autoSwitchThreshold": 20,
            "usageCount": 0,
            "todayUsageCount": 0,
            "playSound": true,
            "showBorderFlash": true,
            "crackSensitivity": 1.0,
            "firstLaunch": true,
            "activePackId": "phoenix"
        });
        let cfg = migrate(raw).unwrap();
        assert_eq!(cfg.version, CURRENT_VERSION);
        assert_eq!(cfg.active_pack_id, "phoenix");
    }

    #[test]
    fn migrate_rejects_unknown_version() {
        let raw = serde_json::json!({ "version": "99.0" });
        let err = migrate(raw).unwrap_err();
        assert!(matches!(err, ConfigError::UnknownVersion(v) if v == "99.0"));
    }

    #[test]
    fn migrate_treats_missing_version_as_v1() {
        // A config with no version field is legacy v1 and gets rejected as such.
        let raw = serde_json::json!({ "hotkey": "ctrl+w" });
        let err = migrate(raw).unwrap_err();
        assert!(matches!(err, ConfigError::UnknownVersion(v) if v == "1.0"));
    }

    #[test]
    fn default_config_has_correct_version() {
        let cfg = Config::default();
        assert_eq!(cfg.version, CURRENT_VERSION);
    }

    #[test]
    fn default_config_has_phrases() {
        let cfg = Config::default();
        assert!(!cfg.phrases.is_empty());
        assert_eq!(cfg.phrases[0], "FASTER");
    }

    #[test]
    fn parse_v3_repairs_empty_phrases() {
        let config = migrate(serde_json::json!({
            "version": "3.0",
            "phrases": ["", "KEEP THIS"],
        }))
        .unwrap();
        assert_eq!(config.phrases, vec!["KEEP THIS"]);

        let config = migrate(serde_json::json!({
            "version": "3.0",
            "phrases": [""],
        }))
        .unwrap();
        assert_eq!(config.phrases, Config::default().phrases);
    }

    #[test]
    fn config_serialization_roundtrip() {
        let cfg = Config::default();
        let json = serde_json::to_string(&cfg).unwrap();
        let deserialized: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg.version, deserialized.version);
        assert_eq!(cfg.hotkey, deserialized.hotkey);
    }

    #[test]
    fn animation_mode_default_is_auto() {
        assert_eq!(AnimationMode::default(), AnimationMode::Auto);
    }

    #[test]
    fn parse_v2_fills_missing_field_from_default() {
        let partial = serde_json::json!({
            "version": "2.0",
            "hotkey": "CmdOrCtrl+W",
            "phrases": ["FASTER"],
            "activeSkin": "default",
            "animationMode": "auto",
            "autoSwitchThreshold": 20,
            "usageCount": 42,
            "todayUsageCount": 5,
            // lastUsageDate intentionally omitted
            "playSound": true,
            "showBorderFlash": true,
            "crackSensitivity": 1.0,
            "firstLaunch": false,
        });
        let cfg = migrate(partial).unwrap();
        assert_eq!(cfg.version, CURRENT_VERSION);
        assert_eq!(cfg.usage_count, 42);
        assert_eq!(cfg.last_usage_date, None); // filled from default
        assert_eq!(cfg.active_pack_id, "rocket"); // migrated default
    }

    #[test]
    fn parse_v2_fills_active_material_id_from_default() {
        // A config written before `activeMaterialId` existed must still parse,
        // picking up the "rocket" default rather than landing in the error state.
        let partial = serde_json::json!({
            "version": "2.0",
            "hotkey": "CmdOrCtrl+W",
            "phrases": ["FASTER"],
            "activeSkin": "default",
            "animationMode": "auto",
            "autoSwitchThreshold": 20,
            "usageCount": 0,
            "todayUsageCount": 0,
            "playSound": true,
            "showBorderFlash": true,
            "crackSensitivity": 1.0,
            "firstLaunch": false,
            // crackSoundId and activeMaterialId intentionally omitted
        });
        let cfg = migrate(partial).unwrap();
        assert_eq!(cfg.active_pack_id, "rocket");
    }

    #[test]
    fn default_config_has_rocket_pack() {
        assert_eq!(Config::default().active_pack_id, "rocket");
    }

    #[test]
    fn window_presence_defaults_to_tray_and_roundtrips_persistent() {
        assert_eq!(Config::default().window_presence, WindowPresence::Tray);
        let config = Config {
            window_presence: WindowPresence::Persistent,
            ..Config::default()
        };
        let json = serde_json::to_value(&config).unwrap();
        assert_eq!(json["windowPresence"], "persistent");
        let parsed: Config = serde_json::from_value(json).unwrap();
        assert_eq!(parsed.window_presence, WindowPresence::Persistent);
    }

    #[test]
    fn parse_v2_ignores_unknown_fields() {
        let with_extra = serde_json::json!({
            "version": "2.0",
            "hotkey": "CmdOrCtrl+W",
            "phrases": ["A"],
            "activeSkin": "default",
            "animationMode": "auto",
            "autoSwitchThreshold": 20,
            "usageCount": 0,
            "todayUsageCount": 0,
            "playSound": true,
            "showBorderFlash": true,
            "crackSensitivity": 1.0,
            "firstLaunch": false,
            "unknownFutureField": "should be ignored",
        });
        assert!(migrate(with_extra).is_ok());
    }

    #[test]
    fn save_and_load_roundtrip_with_path() {
        use std::env;
        let path = env::temp_dir().join("aispur_test_config.json");
        let cfg = Config::default();
        save_config(&path, &cfg).unwrap();
        let loaded = load_config(&path).unwrap();
        assert_eq!(cfg.version, loaded.version);
        std::fs::remove_file(path).ok();
    }

    // ── v3 → v4：quality 画质档位 ──────────────────────────────────────────

    #[test]
    fn migrate_v3_adds_default_quality() {
        // v3 老配置没有 quality 键，迁移后应为 Auto，且版本归一化为 4.0
        // （TS 端 ConfigSchema.version 是 z.literal('4.0')，不归一化会被 Zod 拒绝）。
        let raw = serde_json::json!({
            "version": "3.0",
            "hotkey": "CmdOrCtrl+W",
            "phrases": ["FASTER"],
            "animationMode": "auto",
            "autoSwitchThreshold": 20,
            "usageCount": 3,
            "todayUsageCount": 1,
            "playSound": true,
            "showBorderFlash": true,
            "crackSensitivity": 1.0,
            "theme": "auto",
            "language": "auto",
            "firstLaunch": false,
            "windowPresence": "tray",
            "activePackId": "rocket"
        });
        let cfg = migrate(raw).unwrap();
        assert_eq!(cfg.version, CURRENT_VERSION);
        assert_eq!(cfg.quality, EffectQuality::Auto);
        // 迁移不得丢失原有字段。
        assert_eq!(cfg.usage_count, 3);
        assert_eq!(cfg.today_usage_count, 1);
    }

    #[test]
    fn migrate_v4_keeps_quality() {
        let raw = serde_json::json!({
            "version": "4.0",
            "hotkey": "CmdOrCtrl+W",
            "phrases": ["FASTER"],
            "animationMode": "auto",
            "autoSwitchThreshold": 20,
            "usageCount": 0,
            "todayUsageCount": 0,
            "playSound": true,
            "showBorderFlash": true,
            "crackSensitivity": 1.0,
            "theme": "auto",
            "language": "auto",
            "firstLaunch": false,
            "windowPresence": "tray",
            "activePackId": "rocket",
            "quality": "cinematic"
        });
        let cfg = migrate(raw).unwrap();
        assert_eq!(cfg.quality, EffectQuality::Cinematic);
    }

    #[test]
    fn effect_quality_defaults_to_auto() {
        assert_eq!(EffectQuality::default(), EffectQuality::Auto);
        assert_eq!(Config::default().quality, EffectQuality::Auto);
    }

    #[test]
    fn effect_quality_serialises_lowercase_for_ts_contract() {
        // TS 端 EffectQualitySchema = z.enum(['auto','cinematic','high','medium','low'])，
        // 两端字面量必须逐字一致。
        for (variant, wire) in [
            (EffectQuality::Auto, "auto"),
            (EffectQuality::Cinematic, "cinematic"),
            (EffectQuality::High, "high"),
            (EffectQuality::Medium, "medium"),
            (EffectQuality::Low, "low"),
        ] {
            let config = Config {
                quality: variant,
                ..Config::default()
            };
            let json = serde_json::to_value(&config).unwrap();
            assert_eq!(json["quality"], wire);
            let parsed: Config = serde_json::from_value(json).unwrap();
            assert_eq!(parsed.quality, variant);
        }
    }

    #[test]
    fn migrate_v4_rejects_unknown_quality() {
        let raw = serde_json::json!({
            "version": "4.0",
            "hotkey": "CmdOrCtrl+W",
            "phrases": ["FASTER"],
            "quality": "ultra"
        });
        assert!(matches!(migrate(raw), Err(ConfigError::ParseError(_))));
    }

    #[test]
    fn migrate_v2_chains_through_v3_to_v4() {
        // v2 配置必须一路迁到 v4（含 quality 默认值），否则 TS 端 Zod 会拒绝。
        let raw = serde_json::json!({
            "version": "2.0",
            "hotkey": "CmdOrCtrl+W",
            "phrases": ["FASTER"],
            "activeSkin": "fire",
            "animationMode": "auto",
            "autoSwitchThreshold": 20,
            "usageCount": 5,
            "todayUsageCount": 2,
            "playSound": true,
            "showBorderFlash": true,
            "crackSensitivity": 1.0,
            "firstLaunch": false,
            "activeMaterialId": "meteor",
            "crackSoundId": "guitar"
        });
        let cfg = migrate(raw).unwrap();
        assert_eq!(cfg.version, CURRENT_VERSION);
        assert_eq!(cfg.quality, EffectQuality::Auto);
        assert_eq!(cfg.active_pack_id, "meteor");
        assert_eq!(cfg.usage_count, 5);
    }
}
