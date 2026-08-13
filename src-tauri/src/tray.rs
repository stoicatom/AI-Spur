use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};

/// Build the tray icon and its menu.
///
/// The menu is intentionally flat (no submenus) for faster access and better UX.
/// Each item directly opens the settings window to the corresponding panel.
/// The "Whip It" menu item was removed as triggering via menu click is not a
/// common interaction pattern for this type of utility (users expect hotkeys).
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "settings", "设置…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "退出 AI-Spur", true, None::<&str>)?,
        ],
    )?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("no default window icon")?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("AI-Spur — 催促 Claude Code")
        .menu(&menu)
        // Show the menu on left click too; see the note above.
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => {
                if let Some(window) = app.get_webview_window("settings") {
                    // LSUIElement makes this a non-activating (accessory) app, so
                    // showing a window is not enough — without promoting the app to
                    // a regular activation policy first, macOS keeps the window off
                    // screen even though Tauri reports it as visible.
                    #[cfg(target_os = "macos")]
                    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);

                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|_tray, event| {
            // Clicks are handled by the menu itself now. Enter/Leave/Move still
            // arrive here; ignore them rather than acting on a stray event.
            if let TrayIconEvent::Click { .. } = event {
                // Intentionally empty: show_menu_on_left_click handles display.
            }
        })
        .build(app)?;

    Ok(())
}
