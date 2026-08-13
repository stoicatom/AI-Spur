use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[derive(Debug, Clone, Serialize)]
pub struct ConflictInfo {
    pub hotkey: String,
    pub suggestions: Vec<String>,
}

/// Generate 2 alternative hotkey strings by substituting the final key
/// with alphabetically adjacent keys. Pure function — testable without AppHandle.
pub fn generate_alternatives(hotkey: &str) -> [String; 2] {
    let parts: Vec<&str> = hotkey.split('+').collect();
    let key = match parts.last() {
        Some(k) => *k,
        None => return [format!("{hotkey}1"), format!("{hotkey}2")],
    };
    let modifiers = &parts[..parts.len() - 1];
    let prefix = if modifiers.is_empty() {
        String::new()
    } else {
        format!("{}+", modifiers.join("+"))
    };

    let [alt1, alt2] = adjacent_keys(key);
    [format!("{prefix}{alt1}"), format!("{prefix}{alt2}")]
}

/// Returns [next, prev] substitutes for a key token.
/// - Single ASCII letters: wraps at A/Z.
/// - F-keys (F1–F24): uses adjacent F-key numbers, clamped to [1, 24].
/// - Single digits: uses adjacent digit values, clamped to [0, 9].
/// - Anything else: safe fallback of ["F1", "F2"].
fn adjacent_keys(key: &str) -> [String; 2] {
    // Single letter
    if key.len() == 1 {
        let c = key.chars().next().unwrap().to_ascii_uppercase();
        if c.is_ascii_alphabetic() {
            let next = if c == 'Z' { b'A' } else { c as u8 + 1 } as char;
            let prev = if c == 'A' { b'Z' } else { c as u8 - 1 } as char;
            return [next.to_string(), prev.to_string()];
        }
        if c.is_ascii_digit() {
            let n = c as u8 - b'0';
            let next = (b'0' + if n < 9 { n + 1 } else { n - 1 }) as char;
            let prev = (b'0' + if n > 0 { n - 1 } else { n + 1 }) as char;
            return [next.to_string(), prev.to_string()];
        }
    }
    // F-key: F1���F24
    if let Some(n_str) = key.strip_prefix('F') {
        if let Ok(n) = n_str.parse::<u8>() {
            if (1..=24).contains(&n) {
                let next = if n < 24 { n + 1 } else { n - 1 };
                let prev = if n > 1 { n - 1 } else { n + 1 };
                return [format!("F{next}"), format!("F{prev}")];
            }
        }
    }
    // Safe fallback
    ["F1".to_string(), "F2".to_string()]
}

/// Validate that a hotkey string is non-empty and well-formed.
pub fn validate_hotkey(hotkey: &str) -> bool {
    let trimmed = hotkey.trim();
    !trimmed.is_empty() && !trimmed.ends_with('+') && !trimmed.starts_with('+')
}

/// Register the given hotkey and, when it does not already contain Shift,
/// also register the Shift-augmented Easter-egg variant (e.g. Cmd+Alt+W and
/// Cmd+Alt+Shift+W). This is how the "hold Shift" 彩蛋 works with a plugin
/// that cannot sense the live keyboard state — it is a second registration.
///
/// The plugin's handler receives the *registered* shortcut, so it matches on
/// the string to tell the two apart.
pub fn register(app: &AppHandle, hotkey: &str) -> Result<(), tauri_plugin_global_shortcut::Error> {
    app.global_shortcut().register(hotkey)?;

    // Best effort: if the egg variant is already taken we still keep the
    // primary hotkey working — the egg is a nice-to-have, not core.
    if !hotkey_has_shift(hotkey) {
        if let Some(shifted) = shifted_variant(hotkey) {
            let _ = app.global_shortcut().register(shifted.as_str());
        }
    }

    Ok(())
}

/// True when the accelerator string already includes a Shift modifier.
pub fn hotkey_has_shift(hotkey: &str) -> bool {
    hotkey.split('+').any(|part| {
        let p = part.trim();
        p.eq_ignore_ascii_case("shift") || p.eq_ignore_ascii_case("commandorshift")
    })
}

/// Insert a Shift modifier into a hotkey that does not yet have one, returning
/// a new accelerator string. Returns `None` when already shifted or the format
/// is odd (no way to insert).
pub fn shifted_variant(hotkey: &str) -> Option<String> {
    if hotkey_has_shift(hotkey) {
        return None;
    }
    let parts: Vec<&str> = hotkey.split('+').collect();
    if parts.is_empty() {
        return None;
    }
    // Insert Shift just before the final key token.
    let mut out = parts[..parts.len() - 1].to_vec();
    out.push("Shift");
    out.push(parts[parts.len() - 1]);
    Some(out.join("+"))
}

/// True when `candidate` is the Easter-egg (Shift-augmented) companion of
/// `primary`.
pub fn is_egg_variant(primary: &str, candidate: &str) -> bool {
    shifted_variant(primary).as_deref() == Some(candidate)
}

/// Unregister all currently registered global shortcuts.
pub fn unregister_all(app: &AppHandle) -> Result<(), tauri_plugin_global_shortcut::Error> {
    app.global_shortcut().unregister_all()
}

/// Check whether `hotkey` is already taken by another application.
///
/// Strategy: if this app already owns the hotkey, it's not a conflict — return
/// `None` immediately without touching the registration. Otherwise probe by
/// attempting to register; if that succeeds the key is free (unregister
/// immediately and return `None`); if it fails the key is held by another app
/// and we return `Some(ConflictInfo)` with two suggested alternatives.
pub fn check_conflict(app: &AppHandle, hotkey: &str) -> Option<ConflictInfo> {
    // If we already own this hotkey, it's not a conflict.
    if app.global_shortcut().is_registered(hotkey) {
        return None;
    }

    match app.global_shortcut().register(hotkey) {
        Ok(()) => {
            // Available — clean up and report no conflict.
            let _ = app.global_shortcut().unregister(hotkey);
            None
        }
        Err(_) => {
            let suggestions = generate_alternatives(hotkey).to_vec();
            Some(ConflictInfo {
                hotkey: hotkey.to_string(),
                suggestions,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hotkey_with_shift_detected() {
        assert!(hotkey_has_shift("CommandOrControl+Shift+W"));
        assert!(hotkey_has_shift("Cmd+Shift+A"));
    }

    #[test]
    fn hotkey_without_shift_not_detected() {
        assert!(!hotkey_has_shift("CommandOrControl+Alt+W"));
        assert!(!hotkey_has_shift("Cmd+Alt+F5"));
    }

    #[test]
    fn shifted_variant_inserts_shift_before_key() {
        assert_eq!(
            shifted_variant("CommandOrControl+Alt+W"),
            Some("CommandOrControl+Alt+Shift+W".to_string())
        );
    }

    #[test]
    fn shifted_variant_returns_none_when_already_shifted() {
        assert_eq!(shifted_variant("CommandOrControl+Shift+W"), None);
    }

    #[test]
    fn shifted_variant_handles_single_key() {
        assert_eq!(shifted_variant("F5"), Some("Shift+F5".to_string()));
    }

    #[test]
    fn egg_variant_round_trip() {
        let primary = "CommandOrControl+Alt+W";
        let shifted = shifted_variant(primary).unwrap();
        assert!(is_egg_variant(primary, &shifted));
        assert!(!is_egg_variant(primary, primary));
    }

    // --- validate_hotkey ---

    #[test]
    fn validate_rejects_empty_string() {
        assert!(!validate_hotkey(""));
    }

    #[test]
    fn validate_rejects_whitespace_only() {
        assert!(!validate_hotkey("   "));
    }

    #[test]
    fn validate_rejects_trailing_plus() {
        assert!(!validate_hotkey("CommandOrControl+"));
        assert!(!validate_hotkey("Alt+"));
    }

    #[test]
    fn validate_rejects_leading_plus() {
        assert!(!validate_hotkey("+W"));
    }

    #[test]
    fn validate_accepts_valid_combos() {
        assert!(validate_hotkey("CommandOrControl+Shift+W"));
        assert!(validate_hotkey("Alt+F4"));
        assert!(validate_hotkey("F5"));
        assert!(validate_hotkey("W"));
    }

    // --- generate_alternatives ---

    #[test]
    fn alternatives_substitute_final_key_mid_alphabet() {
        // W (next: X, prev: V)
        let alts = generate_alternatives("CommandOrControl+Shift+W");
        assert_eq!(alts[0], "CommandOrControl+Shift+X");
        assert_eq!(alts[1], "CommandOrControl+Shift+V");
    }

    #[test]
    fn alternatives_wrap_at_z() {
        let alts = generate_alternatives("Alt+Z");
        assert_eq!(alts[0], "Alt+A");
        assert_eq!(alts[1], "Alt+Y");
    }

    #[test]
    fn alternatives_wrap_at_a() {
        let alts = generate_alternatives("Alt+A");
        assert_eq!(alts[0], "Alt+B");
        assert_eq!(alts[1], "Alt+Z");
    }

    #[test]
    fn alternatives_no_modifier() {
        let alts = generate_alternatives("W");
        assert_eq!(alts[0], "X");
        assert_eq!(alts[1], "V");
    }

    #[test]
    fn alternatives_fallback_for_non_letter_key() {
        // F5 ��� F6 / F4 (adjacent valid F-key names)
        let alts = generate_alternatives("CommandOrControl+F5");
        assert!(alts[0].ends_with("F6") || alts[0].ends_with("F4"));
        assert!(alts[1].ends_with("F4") || alts[1].ends_with("F6"));
        assert_ne!(alts[0], alts[1]);
    }

    #[test]
    fn alternatives_single_modifier() {
        let alts = generate_alternatives("Alt+E");
        assert_eq!(alts[0], "Alt+F");
        assert_eq!(alts[1], "Alt+D");
    }
}
