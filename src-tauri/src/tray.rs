use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};

/// Build the tray icon and its menu.
///
/// The menu is flat with direct access to all settings panels for faster UX.
/// Each item opens the settings window and navigates to the corresponding tab.
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "settings:phrases", "提示词管理", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings:skins", "皮肤选择", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings:animation", "动画选项", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings:sounds", "音效设置", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings:theme", "主题外观", true, None::<&str>)?,
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
            id if id.starts_with("settings:") => {
                // Extract the tab name from menu ID (e.g., "settings:prompts" -> "prompts")
                let tab = id.strip_prefix("settings:").unwrap_or("prompts");

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

                    // Emit event to frontend to switch tabs
                    let _ = window.emit("switch-tab", tab);
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
