//! Rust manifest validation stays aligned with `src/shared/material-packs.ts`.

use aispur::packs::{
    self, EffectSpec, FilterType, NoiseColor, OscillatorType, PackManifest, PackPalette,
    SoundFilter, SoundLayer, SoundLayerType, SoundOsc, SoundRecipe,
};
use std::collections::HashMap;

fn valid_manifest() -> PackManifest {
    PackManifest {
        id: "rocket".into(),
        name: "火箭".into(),
        icon: "icon.svg".into(),
        effect: EffectSpec {
            preset: "jet".into(),
            params: HashMap::from([("thrust".into(), 1.2)]),
        },
        sound: SoundRecipe {
            layers: vec![SoundLayer {
                layer_type: SoundLayerType::Noise,
                attack: 0.01,
                decay: 0.4,
                gain: 0.6,
                filter: Some(SoundFilter {
                    filter_type: FilterType::Lowpass,
                    freq: 3_000.0,
                    freq_end: Some(400.0),
                    q: 1.0,
                }),
                osc: Some(SoundOsc {
                    osc_type: OscillatorType::Sine,
                    freq: 220.0,
                    freq_end: Some(80.0),
                }),
                noise_color: Some(NoiseColor::White),
                delay: 0.0,
            }],
            master_gain: 0.8,
        },
        palette: PackPalette {
            body_gradient: ["#FF4400".into(), "#FF6A00".into()],
            particle_hue: 24,
        },
    }
}

fn assert_invalid(manifest: PackManifest, field: &str) {
    let error = manifest
        .validate()
        .expect_err("manifest should be rejected");
    assert!(error.contains(field), "expected {field} in {error}");
}

#[test]
fn accepts_ts_schema_boundary_values() {
    let mut manifest = valid_manifest();
    let layer = &mut manifest.sound.layers[0];
    layer.attack = 0.0;
    layer.decay = 5.0;
    layer.gain = 1.0;
    layer.delay = 1.0;
    let filter = layer.filter.as_mut().unwrap();
    filter.freq = 20.0;
    filter.freq_end = Some(20_000.0);
    filter.q = 30.0;
    let osc = layer.osc.as_mut().unwrap();
    osc.freq = 20.0;
    osc.freq_end = Some(20_000.0);
    manifest.sound.master_gain = 0.05;
    manifest.palette.body_gradient = ["#000000".into(), "#aBcDeF".into()];
    manifest.palette.particle_hue = 359;

    assert!(manifest.validate().is_ok());
}

#[test]
fn rejects_unknown_preset_and_invalid_layer_counts() {
    let mut manifest = valid_manifest();
    manifest.effect.preset = "not-a-preset".into();
    assert_invalid(manifest, "unknown effect preset");

    let mut manifest = valid_manifest();
    manifest.sound.layers.clear();
    assert_invalid(manifest, "1-6 layers");

    let mut manifest = valid_manifest();
    let layer = manifest.sound.layers[0].clone();
    manifest.sound.layers = vec![layer; 7];
    assert_invalid(manifest, "1-6 layers");
}

#[test]
fn rejects_out_of_range_audio_envelope_and_gain_values() {
    for (field, value) in [
        ("attack", -0.001),
        ("attack", 0.501),
        ("decay", 0.009),
        ("decay", 5.001),
        ("gain", -0.001),
        ("gain", 1.001),
        ("delay", -0.001),
        ("delay", 1.001),
        ("masterGain", 0.049),
        ("masterGain", 1.001),
    ] {
        let mut manifest = valid_manifest();
        match field {
            "attack" => manifest.sound.layers[0].attack = value,
            "decay" => manifest.sound.layers[0].decay = value,
            "gain" => manifest.sound.layers[0].gain = value,
            "delay" => manifest.sound.layers[0].delay = value,
            "masterGain" => manifest.sound.master_gain = value,
            _ => unreachable!(),
        }
        assert_invalid(manifest, field);
    }

    let mut manifest = valid_manifest();
    manifest.sound.layers[0].attack = f32::NAN;
    assert_invalid(manifest, "attack");
}

#[test]
fn rejects_out_of_range_filter_values() {
    for (field, value) in [
        ("freq", 19.9),
        ("freq", 20_000.1),
        ("freqEnd", 19.9),
        ("freqEnd", 20_000.1),
        ("q", 0.09),
        ("q", 30.1),
    ] {
        let mut manifest = valid_manifest();
        let filter = manifest.sound.layers[0].filter.as_mut().unwrap();
        match field {
            "freq" => filter.freq = value,
            "freqEnd" => filter.freq_end = Some(value),
            "q" => filter.q = value,
            _ => unreachable!(),
        }
        assert_invalid(manifest, field);
    }

    let mut manifest = valid_manifest();
    manifest.sound.layers[0].filter.as_mut().unwrap().freq = f32::INFINITY;
    assert_invalid(manifest, "freq");
}

#[test]
fn rejects_out_of_range_oscillator_values() {
    for (field, value) in [
        ("freq", 19.9),
        ("freq", 20_000.1),
        ("freqEnd", 19.9),
        ("freqEnd", 20_000.1),
    ] {
        let mut manifest = valid_manifest();
        let osc = manifest.sound.layers[0].osc.as_mut().unwrap();
        match field {
            "freq" => osc.freq = value,
            "freqEnd" => osc.freq_end = Some(value),
            _ => unreachable!(),
        }
        assert_invalid(manifest, field);
    }
}

#[test]
fn rejects_invalid_palette_and_identity_values() {
    for color in ["FF4400", "#FF440", "#FF44000", "#FF44GG"] {
        let mut manifest = valid_manifest();
        manifest.palette.body_gradient[0] = color.into();
        assert_invalid(manifest, "bodyGradient");
    }
    for hue in [-1, 360] {
        let mut manifest = valid_manifest();
        manifest.palette.particle_hue = hue;
        assert_invalid(manifest, "particleHue");
    }
    for id in ["Rocket", "rocket_2", "火箭"] {
        let mut manifest = valid_manifest();
        manifest.id = id.into();
        assert_invalid(manifest, "invalid pack id");
    }
}

#[test]
fn rejects_non_finite_effect_params() {
    let mut manifest = valid_manifest();
    manifest
        .effect
        .params
        .insert("particleCount".into(), f32::INFINITY);
    assert_invalid(manifest, "particleCount");
}

#[test]
fn recipe_defaults_and_audio_enums_deserialize_as_expected() {
    let recipe: SoundRecipe = serde_json::from_value(serde_json::json!({
        "layers": [{
            "type": "impact",
            "attack": 0.002,
            "decay": 0.3,
            "gain": 0.8,
            "osc": { "type": "sine", "freq": 150 }
        }]
    }))
    .unwrap();

    assert_eq!(recipe.master_gain, 0.8);
    assert_eq!(recipe.layers[0].delay, 0.0);
    assert!(recipe.layers[0].filter.is_none());
    assert_eq!(recipe.layers[0].osc.as_ref().unwrap().freq_end, None);

    let invalid_filter: Result<SoundRecipe, _> = serde_json::from_value(serde_json::json!({
        "layers": [{
            "type": "noise", "attack": 0.01, "decay": 0.4, "gain": 0.6,
            "filter": { "type": "comb", "freq": 300 }
        }]
    }));
    assert!(invalid_filter.is_err());
}

#[test]
fn material_pack_serializes_using_the_frontend_contract() {
    let manifest = valid_manifest();
    let pack = packs::MaterialPack {
        id: manifest.id,
        name: manifest.name,
        builtin: true,
        image_file: manifest.icon,
        data_uri: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=".into(),
        effect: manifest.effect,
        sound: manifest.sound,
        palette: manifest.palette,
    };
    let json = serde_json::to_value(pack).unwrap();

    assert_eq!(json["imageFile"], "icon.svg");
    assert_eq!(json["effect"]["preset"], "jet");
    assert_eq!(json["sound"]["layers"][0]["filter"]["freqEnd"], 400.0);
    assert!((json["sound"]["masterGain"].as_f64().unwrap() - 0.8).abs() < 1e-6);
    assert_eq!(json["palette"]["particleHue"], 24);
    assert_eq!(json["builtin"], true);
}

#[test]
fn scan_skips_invalid_custom_manifest_and_missing_directory() {
    let root = std::env::temp_dir().join(format!("aispur-pack-validation-{}", std::process::id()));
    let pack_dir = root.join("unsafe-pack");
    std::fs::create_dir_all(&pack_dir).unwrap();
    std::fs::write(pack_dir.join("icon.svg"), "<svg />").unwrap();
    let mut manifest = valid_manifest();
    manifest.sound.master_gain = 3.0;
    std::fs::write(
        pack_dir.join("pack.json"),
        serde_json::to_string(&manifest).unwrap(),
    )
    .unwrap();

    assert!(packs::scan_packs_in(&root, false).is_empty());
    std::fs::remove_dir_all(&root).unwrap();
    assert!(packs::scan_packs_in(&root, false).is_empty());
}
