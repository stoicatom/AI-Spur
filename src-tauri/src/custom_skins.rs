use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Custom skin manifest structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomSkinManifest {
    pub id: String,
    pub name: String,
    pub image_path: Option<String>, // Future: skin texture image
    pub sounds: Vec<String>,        // List of sound file names (relative to skin dir)
}

/// Get the custom skins directory path.
/// Creates the directory if it doesn't exist.
fn get_custom_skins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    let custom_skins_dir = app_data_dir.join("skins").join("custom");

    if !custom_skins_dir.exists() {
        fs::create_dir_all(&custom_skins_dir)
            .map_err(|e| format!("Failed to create custom skins directory: {e}"))?;
    }

    Ok(custom_skins_dir)
}

/// List all custom skins.
/// Returns a list of skin manifests.
#[tauri::command]
pub fn list_custom_skins(app: AppHandle) -> Result<Vec<CustomSkinManifest>, String> {
    let custom_dir = get_custom_skins_dir(&app)?;

    let mut skins = Vec::new();

    if let Ok(entries) = fs::read_dir(&custom_dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let manifest_path = entry.path().join("skin.json");
                if manifest_path.exists() {
                    if let Ok(content) = fs::read_to_string(&manifest_path) {
                        if let Ok(manifest) = serde_json::from_str::<CustomSkinManifest>(&content) {
                            skins.push(manifest);
                        }
                    }
                }
            }
        }
    }

    Ok(skins)
}

/// Import a custom skin from a source directory.
/// Copies all files to app data skins/custom/<skin_id>/ and generates manifest.
#[tauri::command]
pub fn import_custom_skin(
    app: AppHandle,
    source_dir: String,
    skin_name: String,
) -> Result<CustomSkinManifest, String> {
    let custom_dir = get_custom_skins_dir(&app)?;

    // Generate skin ID from name (slugify)
    let skin_id = skin_name
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-', "-");

    let target_dir = custom_dir.join(&skin_id);

    if target_dir.exists() {
        return Err(format!("Skin with ID '{skin_id}' already exists"));
    }

    // Create target directory
    fs::create_dir_all(&target_dir).map_err(|e| format!("Failed to create skin directory: {e}"))?;

    // Copy all audio files from source
    let source_path = Path::new(&source_dir);
    let mut sounds = Vec::new();

    if let Ok(entries) = fs::read_dir(source_path) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if matches!(ext_str.as_str(), "mp3" | "wav" | "ogg") {
                    let file_name = entry.file_name();
                    let target_file = target_dir.join(&file_name);

                    fs::copy(entry.path(), target_file)
                        .map_err(|e| format!("Failed to copy audio file: {e}"))?;

                    sounds.push(file_name.to_string_lossy().to_string());
                }
            }
        }
    }

    if sounds.is_empty() {
        // Clean up if no sounds found
        let _ = fs::remove_dir_all(&target_dir);
        return Err("No valid audio files found in source directory".to_string());
    }

    // Create manifest
    let manifest = CustomSkinManifest {
        id: skin_id.clone(),
        name: skin_name,
        image_path: None,
        sounds,
    };

    let manifest_path = target_dir.join("skin.json");
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize manifest: {e}"))?;

    fs::write(&manifest_path, manifest_json)
        .map_err(|e| format!("Failed to write manifest: {e}"))?;

    Ok(manifest)
}

/// Delete a custom skin by ID.
#[tauri::command]
pub fn delete_custom_skin(app: AppHandle, skin_id: String) -> Result<(), String> {
    let custom_dir = get_custom_skins_dir(&app)?;
    let skin_dir = custom_dir.join(&skin_id);

    if !skin_dir.exists() {
        return Err(format!("Skin '{skin_id}' not found"));
    }

    fs::remove_dir_all(&skin_dir).map_err(|e| format!("Failed to delete skin directory: {e}"))?;

    Ok(())
}
