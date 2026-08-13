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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub version: String, // "2.0"
    pub hotkey: String,
    pub phrases: Vec<String>,
    pub active_skin: String,
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
    pub first_launch: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: "2.0".to_string(),
            hotkey: "CommandOrControl+Shift+W".to_string(),
            phrases: vec![
                "FASTER".to_string(),
                "KEEP GOING".to_string(),
                "DON'T STOP NOW".to_string(),
                "SHOW ME WHAT YOU GOT".to_string(),
            ],
            active_skin: "default".to_string(),
            animation_mode: AnimationMode::Auto,
            auto_switch_threshold: 20,
            usage_count: 0,
            today_usage_count: 0,
            last_usage_date: None,
            play_sound: true,
            show_border_flash: true,
            crack_sensitivity: 1.0,
            first_launch: true,
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

    match version {
        "2.0" => parse_v2(raw),
        _ => Err(ConfigError::UnknownVersion(version.to_string())),
    }
}

/// Parse a v2 config, filling any absent key from `Config::default()`.
///
/// A field added in a later build is missing from configs written by earlier
/// ones; without the merge serde would reject the whole file and the user would
/// land in the error state instead of picking up one new default. Unknown
/// version strings are still a hard error (see `migrate`) — this only forgives
/// missing keys, never a foreign schema.
fn parse_v2(raw: serde_json::Value) -> Result<Config, ConfigError> {
    let mut merged = serde_json::to_value(Config::default())
        .map_err(|e| ConfigError::ParseError(e.to_string()))?;

    if let (Some(base), Some(given)) = (merged.as_object_mut(), raw.as_object()) {
        for (key, value) in given {
            // Only overwrite keys the current schema knows about, so a stale
            // extra field cannot reach serde and fail the parse.
            if base.contains_key(key) {
                base.insert(key.clone(), value.clone());
            }
        }
    }

    serde_json::from_value(merged).map_err(|e| ConfigError::ParseError(e.to_string()))
}

pub fn save_config(path: &Path, config: &Config) -> Result<(), ConfigError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| ConfigError::WriteError(e.to_string()))?;
    }
    let json =
        serde_json::to_string_pretty(config).map_err(|e| ConfigError::WriteError(e.to_string()))?;
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
        assert_eq!(cfg.version, "2.0");
        assert_eq!(cfg.hotkey, "CommandOrControl+Shift+W");
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
        assert_eq!(cfg.version, "2.0");
    }

    #[test]
    fn default_config_has_phrases() {
        let cfg = Config::default();
        assert!(!cfg.phrases.is_empty());
        assert_eq!(cfg.phrases[0], "FASTER");
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
        assert_eq!(cfg.usage_count, 42);
        assert_eq!(cfg.last_usage_date, None); // filled from default
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
        let path = env::temp_dir().join("openwhip_test_config.json");
        let cfg = Config::default();
        save_config(&path, &cfg).unwrap();
        let loaded = load_config(&path).unwrap();
        assert_eq!(cfg.version, loaded.version);
        std::fs::remove_file(path).ok();
    }
}
