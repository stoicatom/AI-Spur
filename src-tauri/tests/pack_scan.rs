//! 验证真实打包的 30 个内置素材包能被 Rust 扫描解析。

use aispur::packs;

#[test]
fn real_bundled_packs_all_parse() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("packs");
    let packs = packs::scan_packs_in(&dir, true);
    assert_eq!(packs.len(), 30, "expected 30 built-in packs, got {}", packs.len());

    for p in &packs {
        assert!(!p.data_uri.is_empty(), "{} has no data URI", p.id);
        assert!(p.builtin, "{} should be builtin", p.id);
        assert!(!p.sound.layers.is_empty(), "{} has no sound layers", p.id);
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
        assert!(seen.insert(sig), "duplicate effect signature in pack {}", p.id);
    }
}
