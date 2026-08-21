//! Resolves the redesigned material SVG used by built-in material packs.

use serde::Deserialize;
use std::path::{Component, Path, PathBuf};

#[derive(Deserialize)]
struct MaterialIconManifest {
    id: String,
    file: String,
}

const MATERIAL_ALIASES: &[(&str, &str)] = &[
    ("boxing-glove", "boxing"),
    ("bullwhip", "whip"),
    ("comet", "meteor"),
    ("downpour", "rain"),
    ("glass-shot", "crystal"),
    ("ice", "snow"),
    ("katana", "sword"),
    ("ninja-star", "star"),
    ("saxophone", "horn"),
    ("thunder", "drum"),
    ("trumpet", "horn"),
    ("wildfire", "flame"),
];

fn material_id_for(pack_id: &str) -> &str {
    MATERIAL_ALIASES
        .iter()
        .find_map(|(candidate, material)| (*candidate == pack_id).then_some(*material))
        .unwrap_or(pack_id)
}

/// Returns the matching redesigned SVG, falling back to the pack's own icon.
pub fn preferred_builtin_icon(pack_dir: &Path, pack_id: &str, fallback: PathBuf) -> PathBuf {
    let Some(resource_root) = pack_dir.parent().and_then(Path::parent) else {
        return fallback;
    };
    let material_id = material_id_for(pack_id);
    let material_dir = resource_root.join("materials").join(material_id);
    let Ok(content) = std::fs::read_to_string(material_dir.join("manifest.json")) else {
        return fallback;
    };
    let Ok(manifest) = serde_json::from_str::<MaterialIconManifest>(&content) else {
        return fallback;
    };
    let relative = Path::new(&manifest.file);
    if manifest.id != material_id
        || relative.is_absolute()
        || relative
            .components()
            .any(|part| matches!(part, Component::ParentDir))
    {
        return fallback;
    }
    let preferred = material_dir.join(relative);
    if preferred.is_file() {
        preferred
    } else {
        fallback
    }
}
