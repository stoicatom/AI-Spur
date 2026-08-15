use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// A sound preset — either a built-in pack or a user-uploaded collection.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundPreset {
    pub id: String,
    pub name: String,
    pub is_builtin: bool,
    pub files: Vec<String>,
}

/// Metadata written as `preset.json` inside each user sound directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundPresetMeta {
    pub id: String,
    pub name: String,
}

const BUILTIN_PRESETS: &[(&str, &str)] = &[
    ("default", "默认"),
    ("whip", "皮鞭抽响"),
    ("classic", "经典鞭声(初版)"),
    ("rocket", "火箭升空"),
    ("lightning", "闪电电击"),
    ("flame", "火焰呼啸"),
    ("star", "星光叮咚"),
    ("meteor", "流星坠击"),
    ("skull", "骷髅碎裂"),
    ("crown", "王冠加冕"),
    ("sword", "利刃挥斩"),
];

/// Collect all audio file names in a directory.
pub fn collect_audio_files(dir: &Path) -> Vec<String> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                if let Some(ext) = entry.path().extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if matches!(ext_str.as_str(), "mp3" | "wav" | "ogg" | "m4a" | "aac") {
                        files.push(entry.file_name().to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    files.sort();
    files
}

/// Minimal standard base64 encoder (no external dep), sufficient for data URIs.
/// Lives here (a lib-visible module) so both `sounds` and `materials` can encode
/// their `data:` URIs from one implementation.
pub fn base64_encode(input: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            T[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            T[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

/// Encode an audio file as a `data:` URI so the frontend can play it without
/// touching the asset protocol (the sound files live in the dev source tree or
/// the packaged resource dir — the same path ambiguity that broke materials).
/// Returns `None` when the file can't be read.
pub fn audio_data_uri(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let mime = match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("m4a") | Some("aac") => "audio/mp4",
        _ => "application/octet-stream",
    };
    Some(format!("data:{mime};base64,{}", base64_encode(&bytes)))
}

/// Scan the bundled sounds directory for preset subdirectories.
pub fn builtin_presets(sounds_dir: &Path) -> Vec<SoundPreset> {
    let mut presets = Vec::new();

    for &(id, name) in BUILTIN_PRESETS {
        if id == "default" {
            presets.push(SoundPreset {
                id: id.to_string(),
                name: name.to_string(),
                is_builtin: true,
                files: Vec::new(),
            });
            continue;
        }

        let preset_dir = sounds_dir.join(id);
        if preset_dir.is_dir() {
            let files = collect_audio_files(&preset_dir);
            if !files.is_empty() {
                presets.push(SoundPreset {
                    id: id.to_string(),
                    name: name.to_string(),
                    is_builtin: true,
                    files,
                });
            }
        }
    }

    presets
}

/// Scan the user's custom sound directory for preset subdirectories.
pub fn user_presets(custom_dir: &Path) -> Vec<SoundPreset> {
    let mut presets = Vec::new();
    if !custom_dir.is_dir() {
        return presets;
    }

    if let Ok(entries) = fs::read_dir(custom_dir) {
        for entry in entries.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let meta_path = dir.join("preset.json");
            if meta_path.exists() {
                if let Ok(content) = fs::read_to_string(&meta_path) {
                    if let Ok(meta) = serde_json::from_str::<SoundPresetMeta>(&content) {
                        let files = collect_audio_files(&dir);
                        if !files.is_empty() {
                            presets.push(SoundPreset {
                                id: meta.id,
                                name: meta.name,
                                is_builtin: false,
                                files,
                            });
                        }
                    }
                }
            }
        }
    }

    presets
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_audio_files_finds_mp3_wav_ogg() {
        let tmp = std::env::temp_dir().join("aispur-sounds-test");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        fs::write(tmp.join("crack.mp3"), b"audio").unwrap();
        fs::write(tmp.join("hit.wav"), b"audio").unwrap();
        fs::write(tmp.join("boom.ogg"), b"audio").unwrap();
        fs::write(tmp.join("readme.txt"), b"text").unwrap();

        let mut files = collect_audio_files(&tmp);
        files.sort();
        assert_eq!(files, vec!["boom.ogg", "crack.mp3", "hit.wav"]);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn collect_audio_files_empty_dir() {
        let tmp = std::env::temp_dir().join("aispur-sounds-empty-test");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let files = collect_audio_files(&tmp);
        assert!(files.is_empty());

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn builtin_presets_includes_default() {
        let presets = builtin_presets(Path::new("/nonexistent"));
        assert!(presets.iter().any(|p| p.id == "default"));
        let default_preset = presets.iter().find(|p| p.id == "default").unwrap();
        assert!(default_preset.is_builtin);
        assert!(default_preset.files.is_empty());
    }

    #[test]
    fn base64_matches_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"hello"), "aGVsbG8=");
    }

    #[test]
    fn bundled_material_sound_packs_resolve_audio() {
        // The material-matched packs ship real audio in the repo.
        let sounds_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("sounds");
        let presets = builtin_presets(&sounds_dir);
        for id in ["whip", "rocket", "lightning", "flame", "sword"] {
            let p = presets
                .iter()
                .find(|p| p.id == id)
                .unwrap_or_else(|| panic!("missing preset {id}"));
            assert!(!p.files.is_empty(), "preset {id} has no audio files");
        }
    }
}
