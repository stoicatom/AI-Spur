use std::process::Command;

/// Apps that are safe to inject Ctrl+C + text into.
///
/// Checking the frontmost application before synthesizing input prevents the
/// worst failure mode: firing Ctrl+C (copy) + typing + Enter into a browser or
/// editor, which would clobber whatever the user has selected. An unknown app
/// is treated as unsafe — better to skip the whip than to destroy the user's
/// selection.
///
/// This list covers terminal emulators and IDEs that host AI CLI tools
/// (Claude Code, Codex, Aider, Cursor, etc.).
const TERMINAL_APPS: &[&str] = &[
    // macOS terminals
    "Terminal",
    "iTerm2",
    "Ghostty",
    "Warp",
    "Alacritty",
    "kitty",
    "WezTerm",
    "Hyper",
    "Rio",
    "Tabby",
    "tmux",
    // Windows terminals
    "Windows Terminal",
    "WindowsTerminal",
    "PowerShell",
    "Command Prompt",
    "ConEmu",
    "Cmder",
    "MobaXterm",
    "PuTTY",
    "KiTTY",
    "Mintty",
    "Alacritty",
    "WezTerm",
    // Linux terminals
    "GNOME Terminal",
    "Konsole",
    "XFCE Terminal",
    "LXTerminal",
    "Terminator",
    "Tilix",
    "Foot",
    "St",
    "Alacritty",
    "kitty",
    "WezTerm",
    "Rio",
    "Tabby",
    // IDEs with integrated terminals
    "Visual Studio Code",
    "Code",
    "JetBrains",
    "Cursor",
    "Windsurf",
    "Android Studio",
    "Xcode",
    "Zed",
    // Claude Code / Codex / AI CLIs run inside these hosts
    "Claude Code",
    "Codex",
];

/// Case-insensitive substring match against the safe list. Extracted so both
/// the frontmost-app check and the cursor-hit check share one definition.
fn is_safe_app(name: &str) -> bool {
    let lowered = name.to_lowercase();
    TERMINAL_APPS
        .iter()
        .any(|safe| lowered.contains(&safe.to_lowercase()))
}

/// True when the currently focused macOS application looks like a terminal or
/// an editor that runs a terminal, i.e. safe to inject into.
///
/// Non-macOS platforms return `true` — on Linux/Windows the desktop integration
/// for frontmost-app detection is heavier, and the overlay already avoids
/// stealing focus, so the risk is lower and accepted for now.
#[cfg(target_os = "macos")]
pub fn active_app_is_safe() -> bool {
    // Query the frontmost app via System Events; the result is its name.
    let out = match Command::new("osascript")
        .args([
            "-e",
            "tell application \"System Events\" to get name of first application process whose frontmost is true",
        ])
        .output()
    {
        Ok(o) => o,
        Err(_) => return false, // can't tell → don't risk it
    };

    let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if name.is_empty() {
        return false;
    }
    is_safe_app(&name)
}

#[cfg(not(target_os = "macos"))]
pub fn active_app_is_safe() -> bool {
    true
}

/// A candidate app under the cursor.
#[derive(Debug, Clone)]
pub struct HitTarget {
    /// Owner name of the hit window (used by the command layer for logs).
    pub name: String,
    pub pid: i32,
}

/// Returns the safe terminal whose window lies under the global point (x, y).
///
/// When several windows overlap the point, the smallest one containing it is
/// picked first — the topmost／frontmost one in practice, never a full-screen
/// backdrop. Windows owned by this process (the transparent overlay) are
/// excluded by PID, so a pointer over a bare patch of overlay still resolves
/// to the window beneath it.
#[cfg(target_os = "macos")]
pub fn app_under_cursor(x: f64, y: f64) -> Option<HitTarget> {
    use crate::target_window::window::{self, WindowDict};
    use core_foundation::base::TCFType;
    use core_foundation_sys::array::CFArrayGetCount;
    use core_foundation_sys::array::CFArrayGetValueAtIndex;

    // `CGWindowListCopyWindowInfo` returns an array of per-window info
    // dictionaries in one call — no second ID→description step needed.
    let info = core_graphics::window::copy_window_info(
        core_graphics::window::kCGWindowListOptionOnScreenOnly
            | core_graphics::window::kCGWindowListExcludeDesktopElements,
        core_graphics::window::kCGNullWindowID,
    )?;
    let array_ref = info.as_concrete_TypeRef();
    let count = unsafe { CFArrayGetCount(array_ref) };

    let self_pid = std::process::id() as i64;
    let mut candidates: Vec<(String, i32, f64)> = Vec::new(); // (name, pid, area)

    for i in 0..count {
        let element = unsafe { CFArrayGetValueAtIndex(array_ref, i) };
        let dict = WindowDict(element as *const _);
        // Layer 0 is a normal window; skip menus, cursors and everything else.
        let Some(layer) = dict.get_i32(window::K_WINDOW_LAYER) else {
            continue;
        };
        if layer != 0 {
            continue;
        }
        let Some(owner_pid) = dict.get_i32(window::K_OWNER_PID) else {
            continue;
        };
        if owner_pid as i64 == self_pid {
            continue;
        }
        let Some((bx, by, bw, bh)) = dict.get_bounds() else {
            continue;
        };
        if x < bx || x > bx + bw || y < by || y > by + bh {
            continue;
        }
        let name = dict.get_string(window::K_OWNER_NAME).unwrap_or_default();
        if !is_safe_app(&name) {
            continue;
        }
        candidates.push((name, owner_pid, bw * bh));
    }

    // Smallest area first — the on-top window when several overlap.
    candidates.sort_by(|a, b| a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal));
    candidates
        .into_iter()
        .next()
        .map(|(name, pid, _)| HitTarget { name, pid })
}

#[cfg(not(target_os = "macos"))]
pub fn app_under_cursor(_x: f64, _y: f64) -> Option<HitTarget> {
    None
}

/// Bring the app with the given PID to the front. Returns false when the
/// process no longer exists or System Events can't be used (no Accessibility
/// permission — enigo already requires one, so this succeeds whenever the
/// macro backend works).
#[cfg(target_os = "macos")]
pub fn activate_app(pid: i32) -> bool {
    Command::new("osascript")
        .args([
            "-e",
            &format!(
                "tell application \"System Events\" to set frontmost of first process whose unix id is {pid} to true"
            ),
        ])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
pub fn activate_app(_pid: i32) -> bool {
    true
}

/// Accessor over a single CoreGraphics window-info dictionary.
///
/// `CGWindowListCreateDescriptionFromArray` returns one `CFDictionary` per
/// window whose values are generic `CFType` objects (`CFString` / `CFNumber` /
/// `CFData`). This wrapper reads them through `core_foundation_sys` and coerces
/// each key to the requested Rust type — no Objective-C bindings required.
#[cfg(target_os = "macos")]
pub mod window {
    use core_foundation::base::TCFType;
    use core_foundation_sys::base::CFGetTypeID;
    use core_foundation_sys::dictionary::CFDictionaryGetValueIfPresent;
    use core_foundation_sys::number::{
        CFNumberGetTypeID, CFNumberGetValue, kCFNumberFloat64Type, kCFNumberSInt32Type,
    };
    use core_foundation_sys::string::{
        CFStringGetCStringPtr, CFStringGetTypeID, kCFStringEncodingUTF8,
    };
    use std::ffi::CStr;
    use std::os::raw::c_void;

    /// Window-info dictionary keys (the string values of the `kCGWindow*`
    /// globals). `CGWindowListCopyWindowInfo` keys its dictionaries with these
    /// exact literal strings, so they work directly as lookup keys.
    pub const K_OWNER_PID: &str = "kCGWindowOwnerPID";
    pub const K_OWNER_NAME: &str = "kCGWindowOwnerName";
    pub const K_BOUNDS: &str = "kCGWindowBounds";
    pub const K_WINDOW_LAYER: &str = "kCGWindowLayer";

    /// Borrows a single window-info `CFDictionaryRef`. The element handed out
    /// by `CFArrayGetValueAtIndex` is a `const c_void` pointer that is really
    /// a `CFDictionaryRef`; we keep it as a raw pointer and cast on use.
    #[derive(Clone, Copy)]
    pub struct WindowDict(pub *const c_void);

    fn type_id(ptr: *const c_void) -> usize {
        // CFGetTypeID is an unsafe CoreFoundation call; wrap it here once.
        unsafe { CFGetTypeID(ptr) }
    }

    /// Look up a key's raw `CFTypeRef`, or `None` if absent. Constructs the key
    /// `CFString` on demand — cheap, and avoids reaching into the `kCGWindow*`
    /// globals via FFI.
    pub(crate) fn raw(dict: WindowDict, key: &str) -> Option<*const c_void> {
        let key_cf = core_foundation::string::CFString::new(key);
        unsafe {
            let mut value: *const c_void = std::ptr::null();
            CFDictionaryGetValueIfPresent(
                dict.0 as *const _,
                key_cf.as_concrete_TypeRef() as *const c_void,
                &mut value,
            );
            // A hit always writes a non-null value; treat a null read as absent
            // (avoids relying on the exact return type of GetValueIfPresent).
            if !value.is_null() { Some(value) } else { None }
        }
    }

    fn number_get(ptr: *const c_void) -> Option<i32> {
        unsafe {
            if type_id(ptr) != CFNumberGetTypeID() {
                return None;
            }
            let mut v: i32 = 0;
            // CFNumberGetValue returns bool (success).
            if CFNumberGetValue(
                ptr as *const _,
                kCFNumberSInt32Type,
                &mut v as *mut i32 as *mut c_void,
            ) {
                Some(v)
            } else {
                None
            }
        }
    }

    fn string_get(ptr: *const c_void) -> Option<String> {
        unsafe {
            if type_id(ptr) != CFStringGetTypeID() {
                return None;
            }
            let c = CFStringGetCStringPtr(ptr as *const _, kCFStringEncodingUTF8);
            if c.is_null() {
                None
            } else {
                Some(CStr::from_ptr(c).to_string_lossy().into_owned())
            }
        }
    }

    fn bounds_get(ptr: *const c_void) -> Option<(f64, f64, f64, f64)> {
        use core_foundation_sys::dictionary::{CFDictionaryGetCount, CFDictionaryGetKeysAndValues};
        use core_foundation_sys::number::CFNumberGetTypeID;

        unsafe {
            if type_id(ptr) != core_foundation_sys::dictionary::CFDictionaryGetTypeID() {
                return None;
            }
            let dict_ptr = ptr as core_foundation_sys::dictionary::CFDictionaryRef;
            let num_keys = CFDictionaryGetCount(dict_ptr);
            if num_keys != 4 {
                return None; // bounds must have exactly 4 keys
            }

            // Dump all keys and values from the bounds dictionary.
            let mut keys: [*const c_void; 4] = [std::ptr::null(); 4];
            let mut vals: [*const c_void; 4] = [std::ptr::null(); 4];
            CFDictionaryGetKeysAndValues(dict_ptr, keys.as_mut_ptr(), vals.as_mut_ptr());

            // Extract all f64 values from the CFNumber entries.
            let cfnum_id = CFNumberGetTypeID();
            let mut nums: [f64; 4] = [0.0; 4];
            for i in 0..4 {
                if type_id(vals[i]) != cfnum_id {
                    return None;
                }
                if CFNumberGetValue(
                    vals[i] as *const _,
                    kCFNumberFloat64Type,
                    &mut nums[i] as *mut f64 as *mut c_void,
                ) {
                    // success
                } else {
                    return None;
                }
            }

            // The 4 numbers are {X, Y, Width, Height} — same order CGWindow uses.
            Some((nums[0], nums[1], nums[2], nums[3]))
        }
    }

    impl<'a> From<&'a *const c_void> for WindowDict {
        fn from(p: &'a *const c_void) -> Self {
            WindowDict(*p)
        }
    }

    impl WindowDict {
        /// `CFNumber` (SInt32) → `i32` for the layer key.
        pub fn get_i32(self, key: &str) -> Option<i32> {
            raw(self, key).and_then(number_get)
        }
        /// `CFString` → `String`.
        pub fn get_string(self, key: &str) -> Option<String> {
            raw(self, key).and_then(string_get)
        }
        /// `CFData`-wrapped `CGRect` → `(x, y, w, h)`.
        pub fn get_bounds(self) -> Option<(f64, f64, f64, f64)> {
            raw(self, K_BOUNDS).and_then(bounds_get)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_list_matches_case_insensitively() {
        assert!(is_safe_app("iTerm2"));
        assert!(is_safe_app("Terminal"));
        assert!(is_safe_app("Visual Studio Code"));
        assert!(is_safe_app("jetbrains"));
        assert!(is_safe_app("Codex"));
    }

    #[test]
    fn unknown_app_is_not_safe() {
        assert!(!is_safe_app("Google Chrome"));
        assert!(!is_safe_app("Finder"));
        assert!(!is_safe_app(""));
    }

    #[test]
    fn safe_app_list_has_only_nonempty_entries() {
        // Duplicates across platform groupings (e.g. "Alacritty" under both
        // macOS and Linux) are fine — is_safe_app is a substring match — but
        // an empty or whitespace entry would match everything.
        assert!(!TERMINAL_APPS.is_empty());
        for app in TERMINAL_APPS {
            assert!(!app.trim().is_empty(), "empty entry in TERMINAL_APPS");
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn hit_and_activate_do_not_panic_on_live_system() {
        // Boundary-value probes — no guarantee a window sits under the cursor,
        // but the core-graphics path must not panic on a live machine.
        let _ = app_under_cursor(-99999.0, -99999.0);
        let _ = activate_app(i32::MAX); // nonexistent pid → false
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn probe_real_bounds_parse() {
        // Verify bounds parsing on live windows: must return valid (x,y,w,h)
        // without panicking. Hit result depends on what's on screen.
        let hit = app_under_cursor(800.0, 400.0);
        eprintln!("probe: hit={hit:?}");
    }
}
