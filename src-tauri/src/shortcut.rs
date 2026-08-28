use serde::Serialize;
use std::collections::HashSet;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictInfo {
    pub hotkey: String,
    pub suggestions: Vec<String>,
    pub scope: ConflictScope,
    /// The global shortcut backend does not expose the owning process name;
    /// keep the ownership source explicit instead of pretending to know it.
    pub occupied_by: String,
    pub occupied_hotkey: String,
    pub previous_hotkey: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConflictScope {
    Primary,
    ShiftCompanion,
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
pub fn check_conflict(
    app: &AppHandle,
    hotkey: &str,
    previous_hotkey: Option<String>,
) -> Option<ConflictInfo> {
    // System-reserved combinations cannot be detected by probing (they
    // register successfully on macOS but never deliver the keystroke), so the
    // static table wins before we touch the OS at all.
    if let Some(conflict) = reserved_conflict(hotkey, previous_hotkey.clone()) {
        return Some(conflict);
    }
    let registry = AppShortcutRegistry { app };
    let mut probed: Vec<String> = Vec::new();
    for (index, candidate) in registered_set(hotkey).into_iter().enumerate() {
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
                scope: if index == 0 {
                    ConflictScope::Primary
                } else {
                    ConflictScope::ShiftCompanion
                },
                occupied_by: "其他应用".to_string(),
                occupied_hotkey: candidate,
                previous_hotkey,
            });
        }
        probed.push(candidate);
    }
    for shortcut in &probed {
        let _ = registry.unregister(shortcut);
    }
    None
}

// ---------------------------------------------------------------------------
// System-reserved shortcut interception
// ---------------------------------------------------------------------------
//
// The probe strategy in `check_conflict` (register -> unregister) catches
// shortcuts owned by *other applications*, but several OS-level combinations
// are special: registration succeeds (e.g. Carbon's RegisterEventHotKey
// returns noErr for Cmd+Space) while the keystrokes never reach our handler.
// Those must be rejected statically, before any probing.
//
// Policy: conservative — when in doubt, list it ("宁多勿漏"). A false
// positive costs one extra warning in the settings UI; a false negative
// silently kills the shortcut, which is far worse. Entries come from public
// OS behaviour knowledge: macOS Spotlight/input-source/screenshot/AppKit
// window responders, Windows shell (Win+*) & table keys, Linux WM/IME keys.
//
// Precision: every entry matches the FULL modifier set exactly, so
// Cmd+Shift+Space is NOT treated as the reserved Cmd+Space.

/// Occupier label surfaced verbatim to the settings UI for reserved keys.
pub const SYSTEM_RESERVED_OWNER: &str = "系统保留快捷键";

/// Combine modifier flags inside a `const` table.
///
/// bitflags 2.x implements `BitOr` as a plain (non-const) operator, so a
/// literal `Modifiers::A | Modifiers::B` cannot appear in a `const` item.
/// Folding the raw bits and rebuilding with the const `from_bits_retain`
/// produces exactly the same value while staying const-evaluable.
const fn mods(parts: &[Modifiers]) -> Modifiers {
    let mut bits = 0u32;
    let mut index = 0;
    while index < parts.len() {
        bits |= parts[index].bits();
        index += 1;
    }
    Modifiers::from_bits_retain(bits)
}

#[cfg(target_os = "macos")]
const SYSTEM_RESERVED: &[(Modifiers, Code)] = &[
    // Spotlight / system search.
    (Modifiers::SUPER, Code::Space),
    // Input-source switching family (prev / next input method; all exact).
    (Modifiers::CONTROL, Code::Space),
    (mods(&[Modifiers::CONTROL, Modifiers::SHIFT]), Code::Space),
    (mods(&[Modifiers::CONTROL, Modifiers::ALT]), Code::Space),
    // Application switcher.
    (Modifiers::SUPER, Code::Tab),
    // Same-app window cycling (Cmd+`).
    (Modifiers::SUPER, Code::Backquote),
    // Screenshot family: full screen / selection / window / Touch Bar.
    (mods(&[Modifiers::SUPER, Modifiers::SHIFT]), Code::Digit3),
    (mods(&[Modifiers::SUPER, Modifiers::SHIFT]), Code::Digit4),
    (mods(&[Modifiers::SUPER, Modifiers::SHIFT]), Code::Digit5),
    (mods(&[Modifiers::SUPER, Modifiers::SHIFT]), Code::Digit6),
    // Screenshots written to the clipboard (Cmd+Ctrl+Shift+3/4).
    (
        mods(&[Modifiers::SUPER, Modifiers::CONTROL, Modifiers::SHIFT]),
        Code::Digit3,
    ),
    (
        mods(&[Modifiers::SUPER, Modifiers::CONTROL, Modifiers::SHIFT]),
        Code::Digit4,
    ),
    // AppKit window-level responders: quit / close / hide / minimize.
    (Modifiers::SUPER, Code::KeyQ),
    (Modifiers::SUPER, Code::KeyW),
    (Modifiers::SUPER, Code::KeyH),
    (Modifiers::SUPER, Code::KeyM),
    // Force-quit dialog.
    (mods(&[Modifiers::SUPER, Modifiers::ALT]), Code::Escape),
    // Lock screen / log out.
    (mods(&[Modifiers::SUPER, Modifiers::CONTROL]), Code::KeyQ),
    // Conservative per spec: some macOS builds consume Cmd+Ctrl+Delete.
    (mods(&[Modifiers::SUPER, Modifiers::CONTROL]), Code::Delete),
    // Emoji / character picker (Cmd+Ctrl+Space).
    (mods(&[Modifiers::SUPER, Modifiers::CONTROL]), Code::Space),
];

#[cfg(target_os = "windows")]
const SYSTEM_RESERVED: &[(Modifiers, Code)] = &[
    // Alt+Tab switcher and its reverse companion.
    (Modifiers::ALT, Code::Tab),
    (mods(&[Modifiers::ALT, Modifiers::SHIFT]), Code::Tab),
    // Close window.
    (Modifiers::ALT, Code::F4),
    // Task manager.
    (mods(&[Modifiers::CONTROL, Modifiers::SHIFT]), Code::Escape),
    // Security / reboot screen.
    (mods(&[Modifiers::CONTROL, Modifiers::ALT]), Code::Delete),
    // IME / input-language toggle.
    (Modifiers::CONTROL, Code::Space),
    // Shell (Win+*) family: lock, show desktop, explorer, quick link,
    // settings, task view, clipboard history, project, snipping.
    (Modifiers::SUPER, Code::KeyL),
    (Modifiers::SUPER, Code::KeyD),
    (Modifiers::SUPER, Code::KeyE),
    (Modifiers::SUPER, Code::KeyX),
    (Modifiers::SUPER, Code::KeyI),
    (Modifiers::SUPER, Code::Tab),
    (Modifiers::SUPER, Code::KeyV),
    (Modifiers::SUPER, Code::KeyP),
    (mods(&[Modifiers::SUPER, Modifiers::SHIFT]), Code::KeyS),
];

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const SYSTEM_RESERVED: &[(Modifiers, Code)] = &[
    // Window-manager essentials (GNOME/KDE/XFCE all grab these).
    (Modifiers::ALT, Code::Tab),
    (mods(&[Modifiers::ALT, Modifiers::SHIFT]), Code::Tab),
    (Modifiers::ALT, Code::F4),
    // Logout / reboot dialogue on most desktop environments.
    (mods(&[Modifiers::CONTROL, Modifiers::ALT]), Code::Delete),
    // Legacy X.org server restart.
    (mods(&[Modifiers::CONTROL, Modifiers::ALT]), Code::Backspace),
    // IME toggling (fcitx / ibus).
    (Modifiers::CONTROL, Code::Space),
    // Shell / desktop (Super+*) family.
    (Modifiers::SUPER, Code::KeyL),
    (Modifiers::SUPER, Code::KeyD),
    (Modifiers::SUPER, Code::KeyE),
    (Modifiers::SUPER, Code::Tab),
];

/// Rebuild `hotkey` with modifier tokens in canonical order so it can feed
/// `Shortcut::from_str`. The plugin's own parser requires every modifier to
/// precede the key, so "Space+Cmd" and "3+Shift+Command" are unparseable as
/// written — they must still be matchable against the reserved table.
///
/// `commandorcontrol` keeps its own identity: it means SUPER on macOS but
/// CONTROL elsewhere, so the platform decision is deferred to the plugin
/// parser rather than hardcoded here.
fn normalize_hotkey(hotkey: &str) -> Option<Shortcut> {
    let mut modifiers: Vec<&'static str> = Vec::new();
    let mut key: Option<&str> = None;

    for raw in hotkey.split('+') {
        let token = raw.trim();
        if token.is_empty() {
            return None;
        }
        let canonical = match token.to_ascii_lowercase().as_str() {
            "commandorcontrol" | "commandorctrl" | "cmdorctrl" | "cmdorcontrol" => {
                Some("commandorcontrol")
            }
            "command" | "cmd" | "super" | "meta" => Some("super"),
            "control" | "ctrl" => Some("control"),
            "alt" | "option" => Some("alt"),
            "shift" => Some("shift"),
            _ => None,
        };
        match canonical {
            Some(value) => {
                if !modifiers.contains(&value) {
                    modifiers.push(value);
                }
            }
            None => {
                if key.is_some() {
                    return None; // more than one key token — invalid format
                }
                key = Some(token);
            }
        }
    }

    let key = key?;
    let mut rebuilt = modifiers.join("+");
    if !rebuilt.is_empty() {
        rebuilt.push('+');
    }
    rebuilt.push_str(key);
    rebuilt.parse::<Shortcut>().ok()
}

/// True when `hotkey` is an OS-reserved combination whose registration
/// succeeds but whose keystrokes never arrive. Exact match on the full
/// modifier set: `Cmd+Shift+Space` is not the reserved `Cmd+Space`.
pub fn is_system_reserved(hotkey: &str) -> bool {
    let Some(shortcut) = normalize_hotkey(hotkey) else {
        return false;
    };
    SYSTEM_RESERVED
        .iter()
        .any(|(mods, code)| shortcut.mods == *mods && shortcut.key == *code)
}

/// Static-table conflict check — pure, no AppHandle needed. Returns `Some`
/// when the primary (or its Shift companion) is system-reserved.
pub fn reserved_conflict(hotkey: &str, previous_hotkey: Option<String>) -> Option<ConflictInfo> {
    for (index, candidate) in registered_set(hotkey).into_iter().enumerate() {
        if is_system_reserved(&candidate) {
            return Some(ConflictInfo {
                hotkey: hotkey.to_string(),
                suggestions: unique_suggestions(hotkey),
                scope: if index == 0 {
                    ConflictScope::Primary
                } else {
                    ConflictScope::ShiftCompanion
                },
                occupied_by: SYSTEM_RESERVED_OWNER.to_string(),
                occupied_hotkey: candidate,
                previous_hotkey,
            });
        }
    }
    None
}

/// If `candidate` is itself system-reserved, substitute one level of its own
/// adjacent-key alternatives; otherwise keep it unchanged.
fn non_reserved_alternative(candidate: String) -> Option<String> {
    if !is_system_reserved(&candidate) {
        return Some(candidate);
    }
    generate_alternatives(&candidate)
        .into_iter()
        .find(|deeper| !is_system_reserved(deeper))
}

/// Payload for the `shortcut-unavailable` event (startup registration
/// failure surfaced to a live window).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct ShortcutUnavailablePayload {
    pub hotkey: String,
    pub error: String,
}

/// Surface a startup registration failure beyond stderr.
///
/// Channel choice: `tauri-plugin-notification` is NOT in Cargo.toml, and the
/// tray tooltip is owned by tray.rs (touched by the caller's later wiring),
/// so the remaining safe channel is an emitted event. It only reaches a live
/// settings/overlay window — `main.rs`'s setup keeps its own `eprintln!` so the
/// failure is never silently swallowed, and emit errors are logged too.
pub fn notify_startup_registration_failure(app: &AppHandle, hotkey: &str, error: &str) {
    let payload = ShortcutUnavailablePayload {
        hotkey: hotkey.to_string(),
        error: error.to_string(),
    };
    if let Err(emit_error) = app.emit("shortcut-unavailable", &payload) {
        eprintln!("[shortcut] failed to emit shortcut-unavailable: {emit_error}");
    }
}

fn unique_suggestions(hotkey: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    generate_alternatives(hotkey)
        .into_iter()
        .filter_map(non_reserved_alternative)
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
        assert!(validate_hotkey("CommandOrControl+Shift+5"));
        assert!(validate_hotkey("CommandOrControl+5"));
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

    // --- is_system_reserved ---

    #[test]
    #[cfg(target_os = "macos")]
    fn reserved_detects_macos_system_combinations() {
        // Spotlight / input-source switching: RegisterEventHotKey reports
        // success for these but the key never reaches our handler.
        assert!(is_system_reserved("CommandOrControl+Space"));
        assert!(is_system_reserved("Control+Space"));
        assert!(is_system_reserved("Command+Tab"));
        // Screenshot family.
        assert!(is_system_reserved("CommandOrControl+Shift+3"));
        assert!(is_system_reserved("CommandOrControl+Shift+4"));
        assert!(is_system_reserved("CommandOrControl+Shift+5"));
        // AppKit window-level responders.
        assert!(is_system_reserved("CommandOrControl+Q"));
        assert!(is_system_reserved("CommandOrControl+W"));
        assert!(is_system_reserved("CommandOrControl+H"));
        assert!(is_system_reserved("CommandOrControl+M"));
        // Force quit / lock / logout.
        assert!(is_system_reserved("Command+Alt+Escape"));
        assert!(is_system_reserved("Command+Control+Q"));
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn reserved_matches_cmd_and_cmdorctrl_spellings_alike() {
        // On macOS both spellings normalise to SUPER, so the table must hit
        // regardless of which one the recorder produced.
        assert!(is_system_reserved("Cmd+Space"));
        assert!(is_system_reserved("Command+Space"));
        assert!(is_system_reserved("CmdOrCtrl+Space"));
        assert!(is_system_reserved("CommandOrControl+Space"));
    }

    #[test]
    fn reserved_ignores_unreserved_combinations() {
        assert!(!is_system_reserved("CommandOrControl+Shift+W"));
        assert!(!is_system_reserved("CommandOrControl+Alt+W"));
        assert!(!is_system_reserved("Alt+F5"));
        assert!(!is_system_reserved("CommandOrControl+Shift+E"));
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn reserved_requires_exact_modifier_set() {
        // Cmd+Space is reserved; adding Shift makes a *different*, free
        // combination. Matching on "contains Cmd and Space" would over-report.
        assert!(is_system_reserved("Command+Space"));
        assert!(!is_system_reserved("Command+Shift+Space"));
        assert!(!is_system_reserved("Command+Alt+Space"));
        // Same rule the other way: Cmd+Shift+4 is reserved, Cmd+4 is not.
        assert!(is_system_reserved("Command+Shift+4"));
        assert!(!is_system_reserved("Command+4"));
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn reserved_normalises_token_order() {
        // The plugin's parser demands modifiers-before-key, so the reserved
        // check must normalise order itself rather than delegating blindly.
        assert!(is_system_reserved("Space+Cmd"));
        assert!(is_system_reserved("Shift+Command+3"));
        assert!(is_system_reserved("3+Shift+Command"));
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn reserved_table_is_macos_scoped() {
        // Windows-only entries must not leak into the macOS table: Alt+F4 and
        // Alt+Tab are ordinary combinations on macOS.
        assert!(!is_system_reserved("Alt+F4"));
        assert!(!is_system_reserved("Alt+Tab"));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn reserved_detects_windows_system_combinations() {
        assert!(is_system_reserved("Alt+Tab"));
        assert!(is_system_reserved("Alt+F4"));
        assert!(is_system_reserved("Control+Alt+Delete"));
        assert!(is_system_reserved("Super+L"));
        assert!(is_system_reserved("Super+D"));
    }

    #[test]
    fn reserved_ignores_unparseable_input() {
        // Garbage is not "reserved" — validate_hotkey is what rejects it.
        assert!(!is_system_reserved(""));
        assert!(!is_system_reserved("CommandOrControl+"));
        assert!(!is_system_reserved("NotAKey+Whatever"));
    }

    #[test]
    fn suggestions_never_recommend_a_reserved_combination() {
        for hotkey in [
            "CommandOrControl+Shift+W",
            "CommandOrControl+Shift+3",
            "CommandOrControl+Q",
            "Alt+F4",
        ] {
            for suggestion in unique_suggestions(hotkey) {
                assert!(
                    !is_system_reserved(&suggestion),
                    "suggested {suggestion} for {hotkey} is system-reserved"
                );
            }
        }
    }

    #[test]
    fn reserved_conflict_reports_the_system_as_the_owner() {
        // Built without an AppHandle: the static table is consulted before any
        // probe registration, so this path is pure.
        let conflict = reserved_conflict(
            "CommandOrControl+Shift+3",
            Some("CommandOrControl+Shift+W".to_string()),
        );
        if cfg!(target_os = "macos") {
            let conflict = conflict.expect("Cmd+Shift+3 is a macOS screenshot shortcut");
            assert_eq!(conflict.occupied_by, "系统保留快捷键");
            assert_eq!(conflict.occupied_hotkey, "CommandOrControl+Shift+3");
            assert!(matches!(conflict.scope, ConflictScope::Primary));
            assert_eq!(
                conflict.previous_hotkey,
                Some("CommandOrControl+Shift+W".to_string())
            );
            assert!(!conflict.suggestions.is_empty());
            for suggestion in &conflict.suggestions {
                assert!(!is_system_reserved(suggestion));
            }
        }
    }

    #[test]
    fn reserved_conflict_flags_a_reserved_shift_companion() {
        // Cmd+3 itself is free on macOS, but registering it also claims the
        // Cmd+Shift+3 screenshot companion — that must be reported.
        let conflict = reserved_conflict("CommandOrControl+3", None);
        if cfg!(target_os = "macos") {
            let conflict = conflict.expect("the Shift companion is the screenshot shortcut");
            assert_eq!(conflict.occupied_by, "系统保留快捷键");
            assert_eq!(conflict.occupied_hotkey, "CommandOrControl+Shift+3");
            assert!(matches!(conflict.scope, ConflictScope::ShiftCompanion));
        }
    }

    #[test]
    fn reserved_conflict_returns_none_for_a_free_combination() {
        assert!(reserved_conflict("CommandOrControl+Alt+W", None).is_none());
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
