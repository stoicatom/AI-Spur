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

    let (alt1, alt2) = adjacent_keys(key);
    [format!("{prefix}{alt1}"), format!("{prefix}{alt2}")]
}

/// Returns (next, prev) letter substitutes for a key token.
/// For single ASCII letters, wraps at A/Z. Falls back to "<key>1"/"<key>2".
fn adjacent_keys(key: &str) -> (String, String) {
    if key.len() == 1 {
        let c = key.chars().next().unwrap().to_ascii_uppercase();
        if c.is_ascii_alphabetic() {
            let next = if c == 'Z' { b'A' } else { c as u8 + 1 } as char;
            let prev = if c == 'A' { b'Z' } else { c as u8 - 1 } as char;
            return (next.to_string(), prev.to_string());
        }
    }
    (format!("{key}1"), format!("{key}2"))
}

/// Validate that a hotkey string is non-empty and well-formed.
pub fn validate_hotkey(hotkey: &str) -> bool {
    let trimmed = hotkey.trim();
    !trimmed.is_empty() && !trimmed.ends_with('+') && !trimmed.starts_with('+')
}

/// Register a global shortcut via the plugin.
pub fn register(app: &AppHandle, hotkey: &str) -> Result<(), tauri_plugin_global_shortcut::Error> {
    app.global_shortcut().register(hotkey)
}

/// Unregister all currently registered global shortcuts.
pub fn unregister_all(app: &AppHandle) -> Result<(), tauri_plugin_global_shortcut::Error> {
    app.global_shortcut().unregister_all()
}

/// Check whether `hotkey` is already taken by another application.
///
/// Strategy: attempt to register; if that succeeds the key is free (unregister
/// immediately and return `None`); if it fails the key is conflicted and we
/// return `Some(ConflictInfo)` with two suggested alternatives.
pub fn check_conflict(app: &AppHandle, hotkey: &str) -> Option<ConflictInfo> {
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
        // Function keys are not single ASCII letters
        let alts = generate_alternatives("CommandOrControl+F5");
        assert_eq!(alts[0], "CommandOrControl+F51");
        assert_eq!(alts[1], "CommandOrControl+F52");
    }

    #[test]
    fn alternatives_single_modifier() {
        let alts = generate_alternatives("Alt+E");
        assert_eq!(alts[0], "Alt+F");
        assert_eq!(alts[1], "Alt+D");
    }
}
