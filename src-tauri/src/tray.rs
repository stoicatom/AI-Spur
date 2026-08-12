use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
};

/// Set up the system tray icon and context menu.
///
/// Left-click emits `spawn-whip` to the overlay window.
/// Right-click shows a menu with "Open Settings" and "Quit".
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "settings", "Open Settings", true, None::<&str>)?,
            &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
        ],
    )?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("no default window icon")?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("OpenWhip - click for whip")
        .show_menu_on_left_click(false)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "settings" => {
                // Placeholder: settings window not yet implemented (Task 4.2)
                let _ = app.emit("open-settings", ());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray: &TrayIcon, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                // The overlay window is created in Phase 2/3; emit is a no-op until then.
                if let Some(window) = app.get_webview_window("overlay") {
                    let _ = window.emit("spawn-whip", ());
                }
            }
        })
        .build(app)?;

    Ok(())
}
