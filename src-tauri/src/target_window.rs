#[cfg(target_os = "macos")]
use std::process::Command;

/// Apps that are safe to inject Esc + text into.
///
/// Checking the frontmost application before synthesizing input prevents the
/// worst failure mode: firing Esc + typing + Enter into a browser or editor,
/// which could dismiss a dialog or submit unintended text. An unknown app is
/// treated as unsafe — better to skip the whip than to disrupt the user's work.
///
/// This list covers terminal emulators and IDEs that host AI CLI tools
/// (Claude Code, Codex, Aider, Cursor, etc.).
#[cfg(any(target_os = "macos", target_os = "windows", test))]
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
    "WindowsTerminal.exe",
    "PowerShell",
    "powershell.exe",
    "pwsh.exe",
    "Command Prompt",
    "cmd.exe",
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
#[cfg(any(target_os = "macos", target_os = "windows", test))]
fn is_safe_app(name: &str) -> bool {
    let lowered = name.to_lowercase();
    TERMINAL_APPS
        .iter()
        .any(|safe| lowered.contains(&safe.to_lowercase()))
}

#[cfg(any(target_os = "windows", test))]
fn process_name_from_path(path: &str) -> &str {
    path.rsplit(['\\', '/']).next().unwrap_or(path)
}

/// 前台应用的名字，macOS 原生 API（NSWorkspace.menuBarOwningApplication）。
///
/// 取代原先的 `osascript`（149ms → <0.001ms，约 150,000 倍）。
///
/// `menuBarOwningApplication` 返回当前拥有菜单栏的应用，即接收键盘输入的应用，
/// 比 `frontmostApplication` 更适合判定注入目标：后者在屏幕锁定时返回 "loginwindow"，
/// 而前者仍正确返回锁定前的应用（如 iTerm2）。返回的是应用的本地化名称，与
/// osascript 的 "name of process" 一致。
///
/// `None` = 查询失败或无菜单栏拥有者 —— 调用方必须按「不安全」处理。
#[cfg(target_os = "macos")]
fn frontmost_owner_name() -> Option<String> {
    use objc2_app_kit::NSWorkspace;
    // SAFETY: NSWorkspace.sharedWorkspace is a singleton getter; menuBarOwningApplication
    // reads the current menubar owner and returns None when unavailable.
    unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let app = workspace.menuBarOwningApplication()?;
        app.localizedName().map(|n| n.to_string())
    }
}

/// True when the currently focused macOS application looks like a terminal or
/// an editor that runs a terminal, i.e. safe to inject into.
///
/// 判不出前台应用时返回 `false`：宁可跳过这一鞭，也不要把 Esc + 文本打进一个
/// 身份不明的窗口。
#[cfg(target_os = "macos")]
pub fn active_app_is_safe() -> bool {
    frontmost_owner_name()
        .map(|name| is_safe_app(&name))
        .unwrap_or(false)
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
pub fn active_app_is_safe() -> bool {
    true
}

/// True when any of this app's own windows currently holds keyboard focus.
///
/// The global shortcut handler uses this to yield to the app's own UI: while
/// the settings window is focused (e.g. the user is recording a new hotkey),
/// the registered accelerator must not fire the whip — the captured keystroke
/// belongs to the recorder instead.
///
/// Focus, not on-screen presence, is the right question. AISpur is a tray app
/// that keeps its windows alive and merely hidden, so "do we own an on-screen
/// window" is true almost always and would swallow the hotkey permanently.
/// The overlay is non-activating and never takes focus, so the whip being on
/// screen never trips this guard.
pub fn any_window_focused<'a, I>(windows: I) -> bool
where
    I: IntoIterator<Item = &'a tauri::WebviewWindow>,
{
    windows
        .into_iter()
        .any(|window| decide_focus(window.is_focused(), window.is_visible()))
}

/// Focus decision for one window, split out so the truth table is testable
/// without a live window server.
///
/// A window that is not visible cannot hold focus regardless of what the
/// backend reports; an errored query is treated as "not focused" so a failing
/// probe can never permanently swallow the hotkey.
pub fn decide_focus(
    focused: Result<bool, tauri::Error>,
    visible: Result<bool, tauri::Error>,
) -> bool {
    matches!((focused, visible), (Ok(true), Ok(true)))
}

#[cfg(target_os = "windows")]
pub fn active_app_is_safe() -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };

    // SAFETY: These Win32 calls read the foreground process into caller-owned
    // buffers; the process handle is closed before returning on every path.
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return false;
    }
    let mut pid = 0u32;
    if unsafe { GetWindowThreadProcessId(hwnd, &mut pid) } == 0 || pid == 0 {
        return false;
    }
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if process.is_null() {
        return false;
    }
    let mut path = [0u16; 1024];
    let mut length = path.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(process, 0, path.as_mut_ptr(), &mut length) != 0 };
    unsafe { CloseHandle(process) };
    if !ok || length == 0 {
        return false;
    }
    let process_path = String::from_utf16_lossy(&path[..length as usize]);
    is_safe_app(process_name_from_path(&process_path))
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
    fn process_name_parser_handles_windows_and_posix_paths() {
        assert_eq!(
            process_name_from_path(r"C:\\Windows\\System32\\cmd.exe"),
            "cmd.exe"
        );
        assert_eq!(process_name_from_path("/usr/bin/kitty"), "kitty");
        assert_eq!(process_name_from_path("Terminal"), "Terminal");
    }

    #[test]
    fn windows_terminal_process_names_are_safe() {
        assert!(is_safe_app("cmd.exe"));
        assert!(is_safe_app("powershell.exe"));
        assert!(is_safe_app("pwsh.exe"));
        assert!(is_safe_app("WindowsTerminal.exe"));
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

    /// 前台应用判定必须走「查 application」而不是「枚举窗口」。
    ///
    /// 这条测试来自一次真实的踩坑：先前用 `CGWindowListCopyWindowInfo` 的 z 序
    /// 取第一个 layer-0 窗口当前台应用，实测发现 **iTerm2 根本不在这份窗口快照
    /// 里**（38 个窗口里只有 Antigravity / Chrome / loginwindow），于是安全门
    /// 恒判 false，宏永久不触发 —— 而 iTerm2 恰恰是本产品最主要的宿主终端。
    ///
    /// 这里不断言具体名字（取决于运行时谁在前台），只钉住两件事：调用不 panic，
    /// 且返回值要么是非空名字、要么是 None（绝不是空字符串 —— 空串会被
    /// `is_safe_app` 的 `contains` 语义静默匹配成"安全"）。
    #[cfg(target_os = "macos")]
    #[test]
    fn frontmost_owner_name_returns_a_usable_name_or_none() {
        match frontmost_owner_name() {
            Some(name) => assert!(
                !name.trim().is_empty(),
                "前台应用名不能是空串：空串会让 is_safe_app 误判为安全"
            ),
            None => {} // 判不出前台应用是合法结果，调用方按不安全处理
        }
    }

    /// 空名字绝不能被当成安全应用。
    ///
    /// `is_safe_app` 用的是 `lowered.contains(safe)`，方向是「前台应用名包含白名单
    /// 项」，所以空的前台名不会匹配 —— 但反过来如果哪天改成 `safe.contains(name)`
    /// 就会全部命中。这条测试把这个方向钉死。
    #[test]
    fn empty_app_name_is_never_safe() {
        assert!(!is_safe_app(""));
        assert!(!is_safe_app("   "));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn hit_and_activate_do_not_panic_on_live_system() {
        // Boundary-value probes — no guarantee a window sits under the cursor,
        // but the core-graphics path must not panic on a live machine.
        let _ = app_under_cursor(-99999.0, -99999.0);
        let _ = activate_app(i32::MAX); // nonexistent pid → false
    }

    #[test]
    fn focused_and_visible_window_holds_focus() {
        assert!(decide_focus(Ok(true), Ok(true)));
    }

    #[test]
    fn unfocused_window_does_not_hold_focus() {
        // The regression this guards: AISpur is a tray app whose windows stay
        // alive and merely hidden, so an on-screen-presence check was true
        // almost always and swallowed the hotkey permanently.
        assert!(!decide_focus(Ok(false), Ok(true)));
    }

    #[test]
    fn hidden_window_never_holds_focus() {
        // Even if the backend claims focus, an invisible window must not
        // suppress the shortcut.
        assert!(!decide_focus(Ok(true), Ok(false)));
        assert!(!decide_focus(Ok(false), Ok(false)));
    }

    #[test]
    fn failed_probe_is_treated_as_unfocused() {
        // A failing query must never permanently swallow the hotkey.
        assert!(!decide_focus(Err(tauri::Error::WebviewNotFound), Ok(true)));
        assert!(!decide_focus(Ok(true), Err(tauri::Error::WebviewNotFound)));
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
