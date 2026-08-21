//! 与前端 `MaterialPackSchema` 对齐的素材包数值校验。

use super::{EFFECT_PRESETS, PackManifest};

const MIN_FREQUENCY: f32 = 20.0;
const MAX_FREQUENCY: f32 = 20_000.0;

pub(super) fn validate(manifest: &PackManifest) -> Result<(), String> {
    validate_identity(manifest)?;
    validate_effect(manifest)?;
    validate_sound(manifest)?;
    validate_palette(manifest)
}

fn validate_identity(manifest: &PackManifest) -> Result<(), String> {
    if manifest.id.is_empty()
        || !manifest
            .id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(format!("invalid pack id: {}", manifest.id));
    }
    if manifest.name.is_empty() || manifest.name.encode_utf16().count() > 40 {
        return Err("pack name must be 1-40 chars".into());
    }
    if manifest.icon.is_empty() {
        return Err("pack icon must not be empty".into());
    }
    Ok(())
}

fn validate_effect(manifest: &PackManifest) -> Result<(), String> {
    if !EFFECT_PRESETS.contains(&manifest.effect.preset.as_str()) {
        return Err(format!("unknown effect preset: {}", manifest.effect.preset));
    }
    for (name, value) in &manifest.effect.params {
        if !value.is_finite() {
            return Err(format!("effect parameter {name} must be finite"));
        }
    }
    Ok(())
}

fn validate_sound(manifest: &PackManifest) -> Result<(), String> {
    let sound = &manifest.sound;
    if !(1..=6).contains(&sound.layers.len()) {
        return Err("sound recipe must have 1-6 layers".into());
    }
    validate_range(sound.master_gain, "masterGain", 0.05, 1.0)?;

    for (index, layer) in sound.layers.iter().enumerate() {
        let path = format!("sound.layers[{index}]");
        validate_range(layer.attack, &format!("{path}.attack"), 0.0, 0.5)?;
        validate_range(layer.decay, &format!("{path}.decay"), 0.01, 5.0)?;
        validate_range(layer.gain, &format!("{path}.gain"), 0.0, 1.0)?;
        validate_range(layer.delay, &format!("{path}.delay"), 0.0, 1.0)?;

        if let Some(filter) = &layer.filter {
            validate_range(
                filter.freq,
                &format!("{path}.filter.freq"),
                MIN_FREQUENCY,
                MAX_FREQUENCY,
            )?;
            validate_optional_frequency(filter.freq_end, &format!("{path}.filter.freqEnd"))?;
            validate_range(filter.q, &format!("{path}.filter.q"), 0.1, 30.0)?;
        }
        if let Some(osc) = &layer.osc {
            validate_range(
                osc.freq,
                &format!("{path}.osc.freq"),
                MIN_FREQUENCY,
                MAX_FREQUENCY,
            )?;
            validate_optional_frequency(osc.freq_end, &format!("{path}.osc.freqEnd"))?;
        }
    }
    Ok(())
}

fn validate_optional_frequency(value: Option<f32>, name: &str) -> Result<(), String> {
    if let Some(value) = value {
        validate_range(value, name, MIN_FREQUENCY, MAX_FREQUENCY)?;
    }
    Ok(())
}

fn validate_palette(manifest: &PackManifest) -> Result<(), String> {
    if manifest
        .palette
        .body_gradient
        .iter()
        .any(|color| !is_hex_color(color))
    {
        return Err("bodyGradient colors must use #RRGGBB".into());
    }
    if !(0..=359).contains(&manifest.palette.particle_hue) {
        return Err("particleHue out of range 0-359".into());
    }
    Ok(())
}

fn validate_range(value: f32, name: &str, min: f32, max: f32) -> Result<(), String> {
    if !value.is_finite() || value < min || value > max {
        return Err(format!("{name} out of range {min}-{max}"));
    }
    Ok(())
}

fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(|byte| byte.is_ascii_hexdigit())
}
