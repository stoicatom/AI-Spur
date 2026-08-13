use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};

/// Build the tray icon and its menu.
///
/// The menu opens on both left and right click: for a tray-only app the icon
/// is the entire UI surface, so a left click that silently fired an action
/// gave the user no way to reach settings or quit.
///
/// Triggering the whip moved into the menu as an explicit item, alongside the
/// global shortcut which remains the fast path.
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "whip", "挥鞭 (Whip It)", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
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
            "whip" => {
                if let Some(window) = app.get_webview_window("overlay") {
                    // The overlay starts hidden and must be shown before it can
                    // render; emitting alone would animate an invisible window.
                    let _ = window.show();
                    let _ = window.emit("spawn-whip", serde_json::json!({ "forceFull": false }));
                }
            }
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
