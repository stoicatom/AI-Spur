use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SkinError {
    #[error("Skin not found: {0}")]
    NotFound(String),
    #[error("Failed to read skin manifest: {0}")]
    ReadError(String),
    #[error("Invalid skin manifest: {0}")]
    InvalidManifest(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkinVisuals {
    pub handle_color: String,
    pub body_gradient: [String; 2],
    pub tip_glow: bool,
    #[serde(default)]
    pub particle_effect: ParticleEffect,
    pub outline_color: String,
    pub bg_alpha: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkinSounds {
    pub crack: Vec<String>,
    #[serde(default)]
    pub whoosh: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ParticleEffect {
    #[default]
    None,
    Sparks,
    Stars,
    Lightning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinManifest {
    pub spec_version: String, // "1"
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub visuals: SkinVisuals,
    pub sounds: SkinSounds,
}

impl SkinManifest {
    /// Validate that all required fields are within spec constraints.
    pub fn validate(&self) -> Result<(), SkinError> {
        if self.spec_version != "1" {
            return Err(SkinError::InvalidManifest(format!(
                "unsupported spec_version: {}",
                self.spec_version
            )));
        }
        if self.id.is_empty()
            || !self
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err(SkinError::InvalidManifest(format!(
                "invalid skin id: {}",
                self.id
            )));
        }
        if !(0.0..=0.1).contains(&self.visuals.bg_alpha) {
            return Err(SkinError::InvalidManifest("bgAlpha out of range".into()));
        }
        if self.sounds.crack.is_empty() {
            return Err(SkinError::InvalidManifest(
                "sounds.crack must not be empty".into(),
            ));
        }
        Ok(())
    }
}

/// Parse a `manifest.json` inside the given skin directory.
fn parse_manifest(dir: &Path) -> Result<SkinManifest, SkinError> {
    let path = dir.join("manifest.json");
    let contents =
        std::fs::read_to_string(&path).map_err(|e| SkinError::ReadError(e.to_string()))?;
    let manifest: SkinManifest =
        serde_json::from_str(&contents).map_err(|e| SkinError::InvalidManifest(e.to_string()))?;
    manifest.validate()?;
    Ok(manifest)
}

/// Scan a single directory for skin subdirectories containing `manifest.json`.
///
/// Invalid manifests are skipped with a warning rather than failing the whole
/// scan — one broken user skin must not hide every other skin.
pub fn list_skins_in(dir: &Path) -> Vec<SkinManifest> {
    let mut skins = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return skins;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            match parse_manifest(&path) {
                Ok(m) => skins.push(m),
                Err(e) => eprintln!("[skins] skipping {}: {}", path.display(), e),
            }
        }
    }
    skins
}

/// List all available skins: bundled skins plus, when present, user skins.
///
/// Callers resolve both paths (the command layer uses Tauri's resource dir and
/// `app_data_dir()`), keeping this function free of environment assumptions.
/// A user skin whose id matches a bundled skin overrides it.
pub fn list_skins(builtin_dir: &Path, user_dir: Option<&Path>) -> Vec<SkinManifest> {
    let mut skins = list_skins_in(builtin_dir);
    if let Some(user_dir) = user_dir {
        for user_skin in list_skins_in(user_dir) {
            match skins.iter().position(|s| s.id == user_skin.id) {
                Some(i) => skins[i] = user_skin,
                None => skins.push(user_skin),
            }
        }
    }
    skins
}

/// Load a single skin by id from the given directories.
pub fn load_skin(
    id: &str,
    builtin_dir: &Path,
    user_dir: Option<&Path>,
) -> Result<SkinManifest, SkinError> {
    list_skins(builtin_dir, user_dir)
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| SkinError::NotFound(id.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_manifest() -> SkinManifest {
        SkinManifest {
            spec_version: "1".into(),
            id: "test-skin".into(),
            name: "Test Skin".into(),
            description: None,
            author: None,
            visuals: SkinVisuals {
                handle_color: "#111111".into(),
                body_gradient: ["#111111".into(), "#333333".into()],
                tip_glow: false,
                particle_effect: ParticleEffect::None,
                outline_color: "#ffffff".into(),
                bg_alpha: 0.011,
            },
            sounds: SkinSounds {
                crack: vec!["crack.mp3".into()],
                whoosh: vec![],
            },
        }
    }

    #[test]
    fn valid_manifest_passes_validation() {
        assert!(valid_manifest().validate().is_ok());
    }

    #[test]
    fn invalid_spec_version_fails() {
        let mut m = valid_manifest();
        m.spec_version = "2".into();
        assert!(m.validate().is_err());
    }

    #[test]
    fn empty_crack_sounds_fails() {
        let mut m = valid_manifest();
        m.sounds.crack.clear();
        assert!(m.validate().is_err());
    }

    #[test]
    fn bg_alpha_out_of_range_fails() {
        let mut m = valid_manifest();
        m.visuals.bg_alpha = 0.2;
        assert!(m.validate().is_err());
    }

    #[test]
    fn invalid_skin_id_chars_fail() {
        let mut m = valid_manifest();
        m.id = "has spaces".into();
        assert!(m.validate().is_err());
    }

    /// The bundled skins shipped in this repo, used to verify real manifests
    /// parse rather than only hand-built structs.
    fn bundled_skins_dir() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("skins")
    }

    #[test]
    fn bundled_skins_all_parse_and_validate() {
        let skins = list_skins_in(&bundled_skins_dir());
        let mut ids: Vec<&str> = skins.iter().map(|s| s.id.as_str()).collect();
        ids.sort_unstable();
        assert_eq!(ids, ["default", "electric", "fire", "neon"]);
    }

    #[test]
    fn missing_directory_yields_no_skins() {
        let skins = list_skins_in(std::path::Path::new("/nonexistent/aispur/skins"));
        assert!(skins.is_empty());
    }

    #[test]
    fn load_skin_finds_bundled_skin_by_id() {
        let skin = load_skin("fire", &bundled_skins_dir(), None).unwrap();
        assert_eq!(skin.name, "Fire Whip");
        assert_eq!(skin.visuals.particle_effect, ParticleEffect::Sparks);
    }

    #[test]
    fn load_skin_reports_not_found_for_unknown_id() {
        let err = load_skin("no-such-skin", &bundled_skins_dir(), None).unwrap_err();
        assert!(matches!(err, SkinError::NotFound(_)));
    }

    #[test]
    fn user_skin_overrides_bundled_skin_with_same_id() {
        let tmp = std::env::temp_dir().join("aispur-skin-override-test");
        let skin_dir = tmp.join("fire");
        std::fs::create_dir_all(&skin_dir).unwrap();
        let mut custom = valid_manifest();
        custom.id = "fire".into();
        custom.name = "Custom Fire".into();
        std::fs::write(
            skin_dir.join("manifest.json"),
            serde_json::to_string(&custom).unwrap(),
        )
        .unwrap();

        let skins = list_skins(&bundled_skins_dir(), Some(&tmp));
        let fire: Vec<&SkinManifest> = skins.iter().filter(|s| s.id == "fire").collect();
        assert_eq!(fire.len(), 1, "override must not duplicate the id");
        assert_eq!(fire[0].name, "Custom Fire");

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn user_skin_with_new_id_is_appended() {
        let tmp = std::env::temp_dir().join("aispur-skin-append-test");
        let skin_dir = tmp.join("custom-skin");
        std::fs::create_dir_all(&skin_dir).unwrap();
        let mut custom = valid_manifest();
        custom.id = "custom-skin".into();
        std::fs::write(
            skin_dir.join("manifest.json"),
            serde_json::to_string(&custom).unwrap(),
        )
        .unwrap();

        let skins = list_skins(&bundled_skins_dir(), Some(&tmp));
        assert_eq!(skins.len(), 5);
        assert!(skins.iter().any(|s| s.id == "custom-skin"));

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn invalid_user_manifest_is_skipped_not_fatal() {
        let tmp = std::env::temp_dir().join("aispur-skin-invalid-test");
        let skin_dir = tmp.join("broken");
        std::fs::create_dir_all(&skin_dir).unwrap();
        std::fs::write(skin_dir.join("manifest.json"), "{ not valid json").unwrap();

        // The broken skin is skipped; bundled skins still load.
        let skins = list_skins(&bundled_skins_dir(), Some(&tmp));
        assert_eq!(skins.len(), 4);
        assert!(!skins.iter().any(|s| s.id == "broken"));

        std::fs::remove_dir_all(&tmp).ok();
    }
}
