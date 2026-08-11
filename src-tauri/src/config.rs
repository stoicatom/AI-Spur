use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use thiserror::Error;

// Note: These types and functions are not used in main.rs yet but will be
// consumed by Tauri command handlers in subsequent tasks (Task 1.3+).
#[allow(dead_code)]
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

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum AnimationMode {
    Standard,
    Fast,
    #[default]
    Auto,
}

#[allow(dead_code)]
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
            first_launch: true,
        }
    }
}

#[allow(dead_code)]
fn config_path() -> Result<PathBuf, ConfigError> {
    // For Tauri v2, we need to construct the config dir path manually
    // since we don't have access to AppHandle in these standalone functions.
    // Use platform-specific config directories.
    let config_dir = if cfg!(target_os = "macos") {
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

    let config_dir = config_dir
        .ok_or_else(|| ConfigError::ReadError("Cannot determine config dir".to_string()))?;

    std::fs::create_dir_all(&config_dir).map_err(|e| ConfigError::WriteError(e.to_string()))?;

    Ok(config_dir.join("config.json"))
}

#[allow(dead_code)]
pub fn load_config() -> Result<Config, ConfigError> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(Config::default());
    }
    let contents = fs::read_to_string(&path).map_err(|e| ConfigError::ReadError(e.to_string()))?;
    let config: Config =
        serde_json::from_str(&contents).map_err(|e| ConfigError::ParseError(e.to_string()))?;
    Ok(config)
}

#[allow(dead_code)]
pub fn save_config(config: &Config) -> Result<(), ConfigError> {
    let path = config_path()?;
    let json =
        serde_json::to_string_pretty(config).map_err(|e| ConfigError::WriteError(e.to_string()))?;
    fs::write(&path, json).map_err(|e| ConfigError::WriteError(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
