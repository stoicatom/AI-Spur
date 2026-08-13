use std::process::Command;

/// Apps that are safe to inject Ctrl+C + text into.
///
/// Checking the frontmost application before synthesizing input prevents the
/// worst failure mode: firing Ctrl+C (copy) + typing + Enter into a browser or
/// editor, which would clobber whatever the user has selected. An unknown app
/// is treated as unsafe — better to skip the whip than to destroy the user's
/// selection.
const TERMINAL_APPS: &[&str] = &[
    "Terminal",
    "iTerm2",
    "Ghostty",
    "Warp",
    "Alacritty",
    "kitty",
    "WezTerm",
    "Hyper",
    "Android Studio",
    "Xcode",
    "Visual Studio Code",
    "Code",
    "JetBrains",
    // Claude Code runs inside these; the app name reported is the host.
];

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

    // Case-insensitive substring match against the safe list.
    TERMINAL_APPS
        .iter()
        .any(|safe| name.to_lowercase().contains(&safe.to_lowercase()))
}

#[cfg(not(target_os = "macos"))]
pub fn active_app_is_safe() -> bool {
    true
}
