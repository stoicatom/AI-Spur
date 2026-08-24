//! 验证真实打包的 42 个内置素材包能被 Rust 扫描解析。

use aispur::packs;

fn bundled_packs_dir() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("packs")
}

#[test]
fn real_bundled_packs_all_parse() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("packs");
    let packs = packs::scan_packs_in(&dir, true);
    assert_eq!(
        packs.len(),
        42,
        "expected 42 built-in packs, got {}",
        packs.len()
    );

    for p in &packs {
        assert!(!p.data_uri.is_empty(), "{} has no data URI", p.id);
        assert!(p.builtin, "{} should be builtin", p.id);
        assert!(p.sound.sample.is_some() || !p.sound.layers.is_empty(), "{} has no sound source", p.id);
        if let Some(sample) = &p.sound.sample {
            assert!(sample.data_uri.as_deref().unwrap_or_default().starts_with("data:audio/"), "{} has no audio data URI", p.id);
            assert!(!sample.source_title.is_empty(), "{} has no source title", p.id);
        }
        assert!(
            p.palette.particle_hue >= 0 && p.palette.particle_hue <= 359,
            "{} hue out of range: {}",
            p.id,
            p.palette.particle_hue
        );
    }

    // 关键包必须存在
    for id in ["rocket", "phoenix", "lightning", "dragon", "bomb", "aurora"] {
        assert!(packs.iter().any(|p| p.id == id), "missing pack {id}");
    }
}

#[test]
fn builtin_packs_prefer_the_redesigned_material_icons() {
    let packs = packs::scan_packs_in(&bundled_packs_dir(), true);
    for (pack_id, material_id) in [
        ("rocket", "rocket"),
        ("bullwhip", "whip"),
        ("katana", "sword"),
        ("downpour", "rain"),
    ] {
        let pack = packs
            .iter()
            .find(|pack| pack.id == pack_id)
            .unwrap_or_else(|| panic!("missing pack {pack_id}"));
        let icon = std::fs::read(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(format!("materials/{material_id}/{material_id}.svg")),
        )
        .unwrap_or_else(|error| panic!("failed to read {material_id}: {error}"));
        let expected = format!(
            "data:image/svg+xml;base64,{}",
            aispur::sounds::base64_encode(&icon)
        );

        assert_eq!(pack.data_uri, expected, "{pack_id} did not use {material_id}");
    }
}

#[test]
fn every_pack_has_unique_preset_or_params() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("packs");
    let packs = packs::scan_packs_in(&dir, true);
    // 每个包的 effect 至少预设不同或参数不同，保证动画差异化。
    let mut seen = std::collections::HashSet::new();
    for p in &packs {
        let mut params: Vec<(String, i64)> = p
            .effect
            .params
            .iter()
            .map(|(k, v)| (k.clone(), (v * 1000.0) as i64))
            .collect();
        params.sort();
        let sig = format!("{}:{:?}", p.effect.preset, params);
        assert!(
            seen.insert(sig),
            "duplicate effect signature in pack {}",
            p.id
        );
    }
}

#[test]
fn every_builtin_pack_has_a_unique_complete_sound_recipe() {
    let packs = packs::scan_packs_in(&bundled_packs_dir(), true);
    let mut owners = std::collections::HashMap::new();

    for pack in &packs {
        let signature = serde_json::to_string(&pack.sound).expect("sound recipe serializes");
        if let Some(previous) = owners.insert(signature, pack.id.as_str()) {
            panic!(
                "packs {previous} and {} share the same complete sound recipe",
                pack.id
            );
        }
    }

    assert_eq!(owners.len(), packs.len());
}

#[test]
fn every_builtin_pack_has_a_valid_sound_source() {
    let packs = packs::scan_packs_in(&bundled_packs_dir(), true);
    for pack in &packs {
        assert!(pack.sound.sample.is_some() || !pack.sound.layers.is_empty(), "{} has no sound source", pack.id);
    }
}

#[test]
fn every_builtin_material_uses_the_sound_declared_in_its_own_manifest() {
    let dir = bundled_packs_dir();
    let packs = packs::scan_packs_in(&dir, true);

    for pack in &packs {
        let manifest_path = dir.join(&pack.id).join("pack.json");
        let manifest_json = std::fs::read_to_string(&manifest_path)
            .unwrap_or_else(|error| panic!("failed to read {}: {error}", manifest_path.display()));
        let manifest: packs::PackManifest = serde_json::from_str(&manifest_json)
            .unwrap_or_else(|error| panic!("failed to parse {}: {error}", manifest_path.display()));

        assert_eq!(pack.sound.layers, manifest.sound.layers, "{} changed its legacy layers", pack.id);
        assert_eq!(pack.sound.master_gain, manifest.sound.master_gain, "{} changed its master gain", pack.id);
        let scanned = pack.sound.sample.as_ref().expect("sample after scanning");
        let declared = manifest.sound.sample.as_ref().expect("sample in manifest");
        assert_eq!(scanned.file, declared.file, "{} changed its sample file", pack.id);
        assert!(scanned.data_uri.is_some(), "{} sample was not inlined", pack.id);
    }
}
