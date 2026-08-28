//! 自定义素材包编辑（update_custom_pack）的磁盘语义与安全边界。
//!
//! 覆盖：只改 name 时资产字节不变、换扩展名删除旧文件、校验失败磁盘零变更、
//! 不存在 id / 内置 id / 路径穿越 id 全部拒绝、effect_params 落盘并被 scan 读回、
//! delete 的路径穿越防护。

use aispur::pack_edit::{self, PackEdit};
use aispur::packs::{self, EffectSpec, PackManifest, PackPalette, SoundRecipe, SoundSample};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

static COUNTER: AtomicU32 = AtomicU32::new(0);

/// 每个用例一个独立临时目录（无 tempfile 依赖，测试结束由 Drop 清理）。
struct TempDir(PathBuf);

impl TempDir {
    fn new(label: &str) -> Self {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "aispur-pack-edit-{label}-{}-{unique}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("create temp dir");
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

const ICON_SVG: &[u8] = b"<svg xmlns=\"http://www.w3.org/2000/svg\"><rect/></svg>";
const ICON_PNG: &[u8] = b"\x89PNG\r\n\x1a\n-fake-png-bytes";
/// 最小可解析 WAV 头，足够 scan 走完 data URI 内联路径。
const WAV: &[u8] = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00";

fn sample(file: &str) -> SoundSample {
    SoundSample {
        file: file.into(),
        data_uri: None,
        gain: 0.82,
        max_duration: 4.0,
        source_title: "用户上传录音".into(),
        source_url: "https://local.user-upload.invalid/recording".into(),
        license: "用户自有素材".into(),
    }
}

fn manifest(id: &str, icon: &str, sound_file: &str) -> PackManifest {
    PackManifest {
        id: id.into(),
        name: "我的锻炉".into(),
        icon: icon.into(),
        effect: EffectSpec {
            preset: "impact".into(),
            params: HashMap::new(),
        },
        sound: SoundRecipe {
            layers: vec![],
            sample: Some(sample(sound_file)),
            master_gain: 0.8,
        },
        palette: PackPalette {
            body_gradient: ["#ff6b35".into(), "#c23e00".into()],
            particle_hue: 24,
        },
    }
}

/// 在 custom_dir 下建一个完整可扫描的自定义包。
fn seed_pack(custom_dir: &Path, id: &str, icon: &str, sound_file: &str) -> PathBuf {
    let dir = custom_dir.join(id);
    fs::create_dir_all(&dir).expect("create pack dir");
    let icon_bytes = if icon.ends_with(".png") {
        ICON_PNG
    } else {
        ICON_SVG
    };
    fs::write(dir.join(icon), icon_bytes).expect("write icon");
    fs::write(dir.join(sound_file), WAV).expect("write sound");
    let json = serde_json::to_string_pretty(&manifest(id, icon, sound_file)).unwrap();
    fs::write(dir.join("pack.json"), json).expect("write manifest");
    dir
}

fn read_manifest_json(dir: &Path) -> serde_json::Value {
    serde_json::from_str(&fs::read_to_string(dir.join("pack.json")).expect("read manifest"))
        .expect("parse manifest")
}

#[test]
fn renaming_only_leaves_asset_bytes_untouched() {
    let temp = TempDir::new("rename");
    let pack_dir = seed_pack(temp.path(), "my-forge", "icon.svg", "sound.wav");
    let icon_before = fs::read(pack_dir.join("icon.svg")).unwrap();
    let sound_before = fs::read(pack_dir.join("sound.wav")).unwrap();

    let updated = pack_edit::update_pack_at(
        temp.path(),
        "my-forge",
        &PackEdit {
            name: Some("改名后的锻炉".into()),
            ..Default::default()
        },
    )
    .expect("update should succeed");

    assert_eq!(updated.name, "改名后的锻炉");
    assert_eq!(updated.id, "my-forge", "id 不可变");
    assert_eq!(fs::read(pack_dir.join("icon.svg")).unwrap(), icon_before);
    assert_eq!(fs::read(pack_dir.join("sound.wav")).unwrap(), sound_before);
    assert_eq!(read_manifest_json(&pack_dir)["name"], "改名后的锻炉");
    assert_eq!(read_manifest_json(&pack_dir)["icon"], "icon.svg");
    // 临时文件不得残留
    assert!(!pack_dir.join("pack.json.tmp").exists());
}

#[test]
fn switching_icon_extension_removes_the_old_file() {
    let temp = TempDir::new("ext");
    let pack_dir = seed_pack(temp.path(), "my-anvil", "icon.png", "sound.wav");
    let new_icon = temp.path().join("uploaded.svg");
    fs::write(&new_icon, ICON_SVG).unwrap();

    let updated = pack_edit::update_pack_at(
        temp.path(),
        "my-anvil",
        &PackEdit {
            icon_path: Some(new_icon.to_string_lossy().to_string()),
            ..Default::default()
        },
    )
    .expect("update should succeed");

    assert_eq!(updated.icon, "icon.svg");
    assert!(pack_dir.join("icon.svg").is_file(), "新图标应落地");
    assert!(
        !pack_dir.join("icon.png").exists(),
        "旧扩展名图标必须被删除"
    );
    assert_eq!(read_manifest_json(&pack_dir)["icon"], "icon.svg");
    assert!(!pack_dir.join("icon.svg.new").exists(), "临时文件不得残留");
    assert_eq!(fs::read(pack_dir.join("icon.svg")).unwrap(), ICON_SVG);
}

#[test]
fn switching_sound_extension_removes_the_old_audio() {
    let temp = TempDir::new("audio");
    let pack_dir = seed_pack(temp.path(), "my-bell", "icon.svg", "sound.wav");
    let new_sound = temp.path().join("recording.mp3");
    fs::write(&new_sound, b"ID3-fake-mp3").unwrap();

    let updated = pack_edit::update_pack_at(
        temp.path(),
        "my-bell",
        &PackEdit {
            sound_path: Some(new_sound.to_string_lossy().to_string()),
            ..Default::default()
        },
    )
    .expect("update should succeed");

    assert_eq!(updated.sound.sample.as_ref().unwrap().file, "sound.mp3");
    assert!(pack_dir.join("sound.mp3").is_file());
    assert!(!pack_dir.join("sound.wav").exists(), "旧音频必须被删除");
    assert_eq!(
        read_manifest_json(&pack_dir)["sound"]["sample"]["file"],
        "sound.mp3"
    );
}

#[test]
fn validation_failure_leaves_the_pack_completely_untouched() {
    let temp = TempDir::new("invalid");
    let pack_dir = seed_pack(temp.path(), "my-forge", "icon.svg", "sound.wav");
    let manifest_before = fs::read_to_string(pack_dir.join("pack.json")).unwrap();
    let icon_before = fs::read(pack_dir.join("icon.svg")).unwrap();

    let error = pack_edit::update_pack_at(
        temp.path(),
        "my-forge",
        &PackEdit {
            effect_preset: Some("not-a-real-preset".into()),
            ..Default::default()
        },
    )
    .expect_err("unknown preset must be rejected");

    assert!(
        error.contains("not-a-real-preset"),
        "错误应指明预设: {error}"
    );
    assert_eq!(
        fs::read_to_string(pack_dir.join("pack.json")).unwrap(),
        manifest_before,
        "校验失败不得改动 pack.json"
    );
    assert_eq!(fs::read(pack_dir.join("icon.svg")).unwrap(), icon_before);
    assert!(!pack_dir.join("pack.json.tmp").exists());
}

#[test]
fn invalid_palette_is_rejected_before_touching_disk() {
    let temp = TempDir::new("palette");
    let pack_dir = seed_pack(temp.path(), "my-forge", "icon.svg", "sound.wav");
    let before = fs::read_to_string(pack_dir.join("pack.json")).unwrap();

    let error = pack_edit::update_pack_at(
        temp.path(),
        "my-forge",
        &PackEdit {
            palette: Some(PackPalette {
                body_gradient: ["not-a-color".into(), "#c23e00".into()],
                particle_hue: 900,
            }),
            ..Default::default()
        },
    )
    .expect_err("bad palette must be rejected");

    assert!(!error.is_empty());
    assert_eq!(
        fs::read_to_string(pack_dir.join("pack.json")).unwrap(),
        before
    );
}

#[test]
fn missing_pack_id_is_an_error() {
    let temp = TempDir::new("missing");
    let error = pack_edit::update_pack_at(
        temp.path(),
        "does-not-exist",
        &PackEdit {
            name: Some("x".into()),
            ..Default::default()
        },
    )
    .expect_err("missing pack must error");
    assert!(error.contains("does-not-exist"), "错误应指明 id: {error}");
}

#[test]
fn builtin_pack_ids_are_refused() {
    let temp = TempDir::new("builtin");
    // 即便磁盘上真的存在一个影子内置包，也必须拒绝。
    seed_pack(temp.path(), "rocket", "icon.svg", "sound.wav");

    let error = pack_edit::update_pack_at(
        temp.path(),
        "rocket",
        &PackEdit {
            name: Some("冒牌火箭".into()),
            ..Default::default()
        },
    )
    .expect_err("builtin id must be refused");
    assert!(error.contains("内置"), "错误应说明内置不可编辑: {error}");
}

#[test]
fn path_traversal_ids_are_refused() {
    let temp = TempDir::new("traversal");
    let custom_dir = temp.path().join("packs").join("custom");
    fs::create_dir_all(&custom_dir).unwrap();
    // custom 之外的兄弟目录，穿越成功就会被改到。
    let outside = temp.path().join("skins");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("pack.json"), b"{}").unwrap();

    let error = pack_edit::update_pack_at(
        &custom_dir,
        "../../skins",
        &PackEdit {
            name: Some("越权".into()),
            ..Default::default()
        },
    )
    .expect_err("traversal must be refused");

    assert!(!error.is_empty());
    assert!(outside.join("pack.json").is_file(), "目标目录必须原封不动");
}

#[test]
fn effect_params_round_trip_through_disk_and_scan() {
    let temp = TempDir::new("params");
    let pack_dir = seed_pack(temp.path(), "my-forge", "icon.svg", "sound.wav");

    let params = HashMap::from([
        ("chop".to_string(), 1.9_f32),
        ("weight".to_string(), 2.1_f32),
        ("cleave".to_string(), 1.5_f32),
    ]);
    let updated = pack_edit::update_pack_at(
        temp.path(),
        "my-forge",
        &PackEdit {
            effect_preset: Some("impact".into()),
            effect_params: Some(params.clone()),
            ..Default::default()
        },
    )
    .expect("update should succeed");

    assert_eq!(updated.effect.params, params);
    let disk = read_manifest_json(&pack_dir);
    assert_eq!(disk["effect"]["params"]["weight"], 2.1);

    // scan 必须读回参数——这是 overlay 拿到动效参数的唯一路径。
    let scanned = packs::scan_packs_in(temp.path(), false);
    let pack = scanned.iter().find(|p| p.id == "my-forge").expect("scan");
    assert_eq!(pack.effect.params.get("chop"), Some(&1.9));
    assert_eq!(pack.effect.params.get("cleave"), Some(&1.5));
    assert!(!pack.builtin);
}

#[test]
fn params_are_preserved_when_only_the_name_changes() {
    let temp = TempDir::new("keep-params");
    let dir = seed_pack(temp.path(), "my-forge", "icon.svg", "sound.wav");
    let seeded = HashMap::from([("chop".to_string(), 2.4_f32)]);
    let mut base = manifest("my-forge", "icon.svg", "sound.wav");
    base.effect.params = seeded.clone();
    fs::write(
        dir.join("pack.json"),
        serde_json::to_string_pretty(&base).unwrap(),
    )
    .unwrap();

    let updated = pack_edit::update_pack_at(
        temp.path(),
        "my-forge",
        &PackEdit {
            name: Some("换个名字".into()),
            ..Default::default()
        },
    )
    .expect("update should succeed");

    assert_eq!(updated.effect.params, seeded, "未传 params 应沿用旧值");
}

#[test]
fn deleting_a_custom_pack_refuses_traversal_ids() {
    let temp = TempDir::new("delete");
    let custom_dir = temp.path().join("packs").join("custom");
    fs::create_dir_all(&custom_dir).unwrap();
    let outside = temp.path().join("skins");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("manifest.json"), b"{}").unwrap();

    let error = pack_edit::delete_pack_at(&custom_dir, "../../skins")
        .expect_err("traversal delete must be refused");

    assert!(!error.is_empty());
    assert!(outside.is_dir(), "custom 之外的目录不得被删除");
    assert!(outside.join("manifest.json").is_file());
}

#[test]
fn deleting_a_custom_pack_removes_only_that_directory() {
    let temp = TempDir::new("delete-ok");
    seed_pack(temp.path(), "my-forge", "icon.svg", "sound.wav");
    seed_pack(temp.path(), "my-anvil", "icon.svg", "sound.wav");

    pack_edit::delete_pack_at(temp.path(), "my-forge").expect("delete should succeed");

    assert!(!temp.path().join("my-forge").exists());
    assert!(temp.path().join("my-anvil").is_dir(), "同级素材包不受影响");
}
