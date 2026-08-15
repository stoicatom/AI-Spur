//! Material model + filesystem scanning for the cursor/burst visual assets.
//!
//! A "material" is the visual axis of a whip crack, kept fully decoupled from
//! the colour skin and the sound preset. Every material is an **image**: an
//! SVG/raster asset described by a `manifest.json`, either bundled under
//! `materials/<id>/` or user-uploaded to `app_data_dir()/materials/custom/<id>/`.
//! Each built-in image carries a hand-tuned crack animation in the overlay
//! (see `src/overlay/material-visual.ts`), so the earlier emoji "vector"
//! materials were removed — they read as generic and had no bespoke burst.
//!
//! This module is pure: it parses manifests and scans directories. Path
//! resolution and Tauri wiring live in `material_commands.rs` (R-ARCH-008).

use serde::{Deserialize, Serialize};
use std::path::Path;

/// The kind discriminator on a `Material`. Every material is currently an
/// image; the enum is retained (rather than dropping the `kind` field) so the
/// IPC shape stays stable and a future non-image kind can be added without a
/// breaking migration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MaterialKind {
    #[serde(rename = "image")]
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Material {
    pub id: String,
    pub name: String,
    pub kind: MaterialKind,
    pub builtin: bool,
    /// The asset file name, relative to the material's own directory.
    pub image_file: String,
    /// The image encoded as a `data:` URI, resolved at scan time. Embedding the
    /// bytes sidesteps the asset-protocol entirely: a relative path is ambiguous
    /// between the dev source tree and the packaged resource dir (and would fall
    /// outside the asset scope), which is why built-in materials failed to render
    /// in dev. SVG/PNG material assets are small, so inlining is cheap.
    pub data_uri: String,
}

/// Build a `data:` URI for an image file, choosing the MIME type by extension.
/// Returns `None` when the file can't be read.
pub fn image_data_uri(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let mime = match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    };
    Some(format!(
        "data:{mime};base64,{}",
        crate::sounds::base64_encode(&bytes)
    ))
}

/// On-disk `manifest.json` for an image material. Extra keys (e.g. an on-disk
/// `specVersion`) are ignored by serde, so a richer manifest still parses.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialManifest {
    pub id: String,
    pub name: String,
    pub file: String,
}

/// Parse one image material from a directory containing `manifest.json`.
///
/// Returns `None` (skipping the material rather than failing the whole scan)
/// when the manifest is missing/invalid or its referenced asset file is absent —
/// a broken material must not hide the rest, and a dangling `file` would 404 in
/// the overlay.
fn parse_image_material(dir: &Path, builtin: bool) -> Option<Material> {
    let content = std::fs::read_to_string(dir.join("manifest.json")).ok()?;
    let manifest: MaterialManifest = serde_json::from_str(&content).ok()?;
    let asset_path = dir.join(&manifest.file);
    if !asset_path.is_file() {
        return None;
    }
    let data_uri = image_data_uri(&asset_path)?;
    Some(Material {
        id: manifest.id,
        name: manifest.name,
        kind: MaterialKind::Image,
        builtin,
        image_file: manifest.file,
        data_uri,
    })
}

/// Scan a directory for image-material subdirectories (each `<id>/manifest.json`).
pub fn scan_image_materials(dir: &Path, builtin: bool) -> Vec<Material> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(m) = parse_image_material(&path, builtin) {
                out.push(m);
            }
        }
    }
    out
}

/// List every available material: built-in images, then (when present) the
/// user's custom images. Callers resolve both directories so this stays free of
/// environment assumptions (mirrors `skins::list_skins`).
pub fn list_materials(builtin_image_dir: &Path, user_image_dir: Option<&Path>) -> Vec<Material> {
    let mut materials = scan_image_materials(builtin_image_dir, true);
    if let Some(user) = user_image_dir {
        materials.extend(scan_image_materials(user, false));
    }
    materials
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Bundled image materials shipped in this repo, used to verify real
    /// manifests parse rather than only hand-built structs.
    fn bundled_materials_dir() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("materials")
    }

    #[test]
    fn scan_finds_bundled_image_materials() {
        let materials = scan_image_materials(&bundled_materials_dir(), true);
        assert!(!materials.is_empty());
        assert!(materials.iter().all(|m| m.kind == MaterialKind::Image));
        assert!(
            materials
                .iter()
                .all(|m| m.builtin && !m.image_file.is_empty())
        );
        assert!(materials.iter().any(|m| m.id == "rocket"));
        // The pioneering whip material — the original whip + crack sound —
        // ships as the first built-in.
        assert!(materials.iter().any(|m| m.id == "whip"));
    }

    #[test]
    fn missing_directory_yields_no_materials() {
        let materials =
            scan_image_materials(std::path::Path::new("/nonexistent/aispur/materials"), true);
        assert!(materials.is_empty());
    }

    #[test]
    fn list_materials_returns_only_bundled_images() {
        let all = list_materials(&bundled_materials_dir(), None);
        assert!(!all.is_empty());
        assert!(all.iter().all(|m| m.kind == MaterialKind::Image));
        // The hand-designed built-ins ship in this repo.
        assert!(all.iter().any(|m| m.id == "rocket"));
        assert!(all.iter().any(|m| m.id == "lightning"));
        assert!(all.iter().any(|m| m.id == "whip"));
    }

    #[test]
    fn image_serializes_kind_and_file() {
        let m = Material {
            id: "skull".into(),
            name: "骷髅".into(),
            kind: MaterialKind::Image,
            builtin: true,
            image_file: "skull.svg".into(),
            data_uri: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=".into(),
        };
        let json = serde_json::to_value(&m).unwrap();
        assert_eq!(json["kind"], "image");
        assert_eq!(json["imageFile"], "skull.svg");
        assert!(
            json["dataUri"]
                .as_str()
                .unwrap()
                .starts_with("data:image/svg+xml;base64,")
        );
    }

    #[test]
    fn scanned_material_carries_svg_data_uri() {
        let materials = scan_image_materials(&bundled_materials_dir(), true);
        let rocket = materials.iter().find(|m| m.id == "rocket").unwrap();
        assert!(rocket.data_uri.starts_with("data:image/svg+xml;base64,"));
        assert!(rocket.data_uri.len() > 100); // real encoded content, not empty
    }
}
