use serde::Serialize;
use std::collections::HashSet;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

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
            let [next, prev] = match n {
                0 => *b"12",
                9 => *b"87",
                _ => [b'0' + n + 1, b'0' + n - 1],
            };
            return [next.to_string(), prev.to_string()];
        }
    }
    // F-key: F1–F24
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

/// Validate that a hotkey string is a supported combination with a modifier.
pub fn validate_hotkey(hotkey: &str) -> bool {
    let trimmed = hotkey.trim();
    let parts: Vec<&str> = trimmed.split('+').map(str::trim).collect();
    if parts.len() < 2 || parts.iter().any(|part| part.is_empty()) {
        return false;
    }

    let mut modifiers = HashSet::new();
    for part in &parts[..parts.len() - 1] {
        let canonical = match part.to_ascii_lowercase().as_str() {
            "commandorcontrol" | "commandorctrl" | "cmdorctrl" | "cmdorcontrol" => {
                "commandorcontrol"
            }
            "command" | "cmd" | "super" => "command",
            "control" | "ctrl" => "control",
            "alt" | "option" => "alt",
            "shift" => "shift",
            _ => return false,
        };
        if !modifiers.insert(canonical) {
            return false;
        }
    }

    trimmed.parse::<Shortcut>().is_ok()
}

/// Return the shortcuts that belong to one configured primary combination.
/// An unshifted primary owns a second Shift companion for the full-animation
/// easter egg; a shifted primary is already complete and owns no companion.
pub fn registered_set(hotkey: &str) -> Vec<String> {
    let primary = hotkey.trim().to_string();
    let mut set = vec![primary.clone()];
    if let Some(shifted) = shifted_variant(&primary) {
        set.push(shifted);
    }
    set
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
            if let Err(error) = app.global_shortcut().register(shifted.as_str()) {
                let _ = app.global_shortcut().unregister(hotkey);
                return Err(error);
            }
        }
    }

    Ok(())
}

trait ShortcutRegistry {
    fn register(&self, hotkey: &str) -> Result<(), String>;
    fn unregister(&self, hotkey: &str) -> Result<(), String>;
    fn is_registered(&self, hotkey: &str) -> bool;
}

struct AppShortcutRegistry<'a> {
    app: &'a AppHandle,
}

impl ShortcutRegistry for AppShortcutRegistry<'_> {
    fn register(&self, hotkey: &str) -> Result<(), String> {
        self.app
            .global_shortcut()
            .register(hotkey)
            .map_err(|e| e.to_string())
    }

    fn unregister(&self, hotkey: &str) -> Result<(), String> {
        self.app
            .global_shortcut()
            .unregister(hotkey)
            .map_err(|e| e.to_string())
    }

    fn is_registered(&self, hotkey: &str) -> bool {
        self.app.global_shortcut().is_registered(hotkey)
    }
}

/// Rebind a shortcut set without dropping the old registration first.
///
/// The persistence callback runs only after every new member is registered.
/// If registration or persistence fails, newly added members are removed and
/// the old set remains active, so callers never leave a saved dead shortcut.
pub fn rebind<F>(
    app: &AppHandle,
    old_hotkey: &str,
    new_hotkey: &str,
    persist: F,
) -> Result<(), String>
where
    F: FnOnce() -> Result<(), String>,
{
    let registry = AppShortcutRegistry { app };
    rebind_with_registry(&registry, old_hotkey, new_hotkey, persist)
}

fn rebind_with_registry<R, F>(
    registry: &R,
    old_hotkey: &str,
    new_hotkey: &str,
    persist: F,
) -> Result<(), String>
where
    R: ShortcutRegistry,
    F: FnOnce() -> Result<(), String>,
{
    if !validate_hotkey(new_hotkey) {
        return Err(format!("Invalid hotkey format: {new_hotkey}"));
    }

    let old_set = registered_set(old_hotkey);
    let new_set = registered_set(new_hotkey);
    let additions: Vec<String> = new_set
        .iter()
        .filter(|shortcut| !old_set.contains(shortcut))
        .cloned()
        .collect();
    let mut registered: Vec<String> = Vec::new();

    for shortcut in additions {
        if let Err(error) = registry.register(&shortcut) {
            for added in &registered {
                let _ = registry.unregister(added);
            }
            return Err(format!("failed to register {shortcut}: {error}"));
        }
        registered.push(shortcut);
    }

    if let Err(error) = persist() {
        for added in &registered {
            let _ = registry.unregister(added);
        }
        return Err(error);
    }

    for shortcut in &old_set {
        if !new_set.contains(shortcut) {
            // The new set is already persisted and active; cleanup is best
            // effort because an OS unregister failure must not invalidate it.
            let _ = registry.unregister(shortcut);
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
    let Some(shifted) = shifted_variant(primary) else {
        return false;
    };
    match (shifted.parse::<Shortcut>(), candidate.parse::<Shortcut>()) {
        (Ok(expected), Ok(actual)) => expected == actual,
        _ => false,
    }
}

/// Check whether `hotkey` is already taken by another application.
///
/// Strategy: if this app already owns the hotkey, it's not a conflict — return
/// `None` immediately without touching the registration. Otherwise probe by
/// attempting to register; if that succeeds the key is free (unregister
/// immediately and return `None`); if it fails the key is held by another app
/// and we return `Some(ConflictInfo)` with two suggested alternatives.
pub fn check_conflict(app: &AppHandle, hotkey: &str) -> Option<ConflictInfo> {
    let registry = AppShortcutRegistry { app };
    let mut probed: Vec<String> = Vec::new();
    for candidate in registered_set(hotkey) {
        if registry.is_registered(&candidate) {
            continue;
        }
        if registry.register(&candidate).is_err() {
            for shortcut in &probed {
                let _ = registry.unregister(shortcut);
            }
            return Some(ConflictInfo {
                hotkey: hotkey.to_string(),
                suggestions: unique_suggestions(hotkey),
            });
        }
        probed.push(candidate);
    }
    for shortcut in &probed {
        let _ = registry.unregister(shortcut);
    }
    None
}

fn unique_suggestions(hotkey: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    generate_alternatives(hotkey)
        .into_iter()
        .filter(|suggestion| seen.insert(suggestion.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    struct FakeRegistry {
        registered: Mutex<HashSet<String>>,
        fail_on: Option<String>,
        calls: Mutex<Vec<String>>,
    }

    impl FakeRegistry {
        fn with(initial: &[&str], fail_on: Option<&str>) -> Self {
            Self {
                registered: Mutex::new(initial.iter().map(|value| (*value).to_string()).collect()),
                fail_on: fail_on.map(str::to_string),
                calls: Mutex::new(Vec::new()),
            }
        }
    }

    impl ShortcutRegistry for FakeRegistry {
        fn register(&self, hotkey: &str) -> Result<(), String> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("register:{hotkey}"));
            if self.fail_on.as_deref() == Some(hotkey) {
                return Err("occupied".to_string());
            }
            self.registered.lock().unwrap().insert(hotkey.to_string());
            Ok(())
        }

        fn unregister(&self, hotkey: &str) -> Result<(), String> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("unregister:{hotkey}"));
            self.registered.lock().unwrap().remove(hotkey);
            Ok(())
        }

        fn is_registered(&self, hotkey: &str) -> bool {
            self.registered.lock().unwrap().contains(hotkey)
        }
    }

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

    #[test]
    fn egg_variant_accepts_plugin_normalized_spelling() {
        let candidate = if cfg!(target_os = "macos") {
            "super+alt+shift+KeyW"
        } else {
            "control+alt+shift+KeyW"
        };
        assert!(is_egg_variant("CommandOrControl+Alt+W", candidate));
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
        assert!(validate_hotkey("CommandOrControl+F5"));
        assert!(validate_hotkey("CommandOrControl+W"));
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
        // F5 – F6 / F4 (adjacent valid F-key names)
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

    #[test]
    fn registered_set_only_keeps_primary_when_shift_is_present() {
        assert_eq!(
            registered_set("CommandOrControl+Shift+5"),
            vec!["CommandOrControl+Shift+5".to_string()]
        );
    }

    #[test]
    fn registered_set_adds_shift_companion_for_unshifted_primary() {
        assert_eq!(
            registered_set("CommandOrControl+5"),
            vec![
                "CommandOrControl+5".to_string(),
                "CommandOrControl+Shift+5".to_string()
            ]
        );
    }

    #[test]
    fn validate_rejects_modifier_only_and_unknown_main_keys() {
        assert!(!validate_hotkey("CommandOrControl+Shift"));
        assert!(!validate_hotkey("CommandOrControl+Shift+Key5"));
        assert!(!validate_hotkey("F5"));
    }

    #[test]
    fn alternatives_for_zero_are_distinct() {
        let alternatives = generate_alternatives("CommandOrControl+Shift+0");
        assert_ne!(alternatives[0], alternatives[1]);
    }

    #[test]
    fn rebind_registers_new_set_before_removing_old_set() {
        let registry =
            FakeRegistry::with(&["CommandOrControl+W", "CommandOrControl+Shift+W"], None);
        let persisted = Arc::new(Mutex::new(false));
        let persisted_for_callback = Arc::clone(&persisted);

        rebind_with_registry(
            &registry,
            "CommandOrControl+W",
            "CommandOrControl+E",
            move || {
                *persisted_for_callback.lock().unwrap() = true;
                Ok(())
            },
        )
        .unwrap();

        assert!(*persisted.lock().unwrap());
        assert!(registry.is_registered("CommandOrControl+E"));
        assert!(registry.is_registered("CommandOrControl+Shift+E"));
        assert!(!registry.is_registered("CommandOrControl+W"));
        assert!(!registry.is_registered("CommandOrControl+Shift+W"));
    }

    #[test]
    fn rebind_rolls_back_when_companion_registration_fails() {
        let registry = FakeRegistry::with(
            &["CommandOrControl+W", "CommandOrControl+Shift+W"],
            Some("CommandOrControl+Shift+E"),
        );
        let result = rebind_with_registry(
            &registry,
            "CommandOrControl+W",
            "CommandOrControl+E",
            || Ok(()),
        );

        assert!(result.is_err());
        assert!(registry.is_registered("CommandOrControl+W"));
        assert!(registry.is_registered("CommandOrControl+Shift+W"));
        assert!(!registry.is_registered("CommandOrControl+E"));
    }

    #[test]
    fn rebind_rolls_back_when_persistence_fails() {
        let registry =
            FakeRegistry::with(&["CommandOrControl+W", "CommandOrControl+Shift+W"], None);
        let result = rebind_with_registry(
            &registry,
            "CommandOrControl+W",
            "CommandOrControl+E",
            || Err("disk full".to_string()),
        );

        assert_eq!(result, Err("disk full".to_string()));
        assert!(registry.is_registered("CommandOrControl+W"));
        assert!(registry.is_registered("CommandOrControl+Shift+W"));
        assert!(!registry.is_registered("CommandOrControl+E"));
        assert!(!registry.is_registered("CommandOrControl+Shift+E"));
    }
}
