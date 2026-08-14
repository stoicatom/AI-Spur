use tauri::{
    AppHandle, Emitter, Manager,
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};

/// The menu-bar template icon: a pure-black + alpha silhouette. macOS recolours
/// a template icon to match the menu bar (light/dark, active/inactive), so it
/// must NOT be the colourful app icon — that is the root cause of the blurry
/// status-bar glyph (task 2). Embedded via `include_bytes!` so it never depends
/// on a bundle resource path resolving at runtime.
const TRAY_TEMPLATE_PNG: &[u8] = include_bytes!("../icons/tray-template@2x.png");

/// Build the tray icon and its menu.
///
/// The menu is flat with direct access to all settings panels for faster UX.
/// Each item opens the settings window and navigates to the corresponding tab.
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "settings:phrases", "词库管理", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings:skins", "皮肤切换", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings:animation", "动画模式", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings:sounds", "音效管理", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings:theme", "主题外观", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "退出应用", true, None::<&str>)?,
        ],
    )?;

    // Load the dedicated monochrome template icon rather than the colourful
    // app icon. `icon_as_template(true)` requires a black+alpha bitmap on macOS.
    let icon = Image::from_bytes(TRAY_TEMPLATE_PNG)
        .map_err(|e| format!("failed to decode tray template icon: {e}"))?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("AISpur — AI 终端加速器")
        .menu(&menu)
        // Right-click shows the context menu (system default behavior).
        // Left-click is handled in on_tray_icon_event to open the settings panel.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            id if id.starts_with("settings:") => {
                let tab = id.strip_prefix("settings:").unwrap_or("trigger");
                if let Some(window) = app.get_webview_window("settings") {
                    #[cfg(target_os = "macos")]
                    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    let _ = window.emit("switch-tab", tab);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Left-click opens the app (settings window). The overlay is reached
            // only through the global hotkey — dragging there produces the effect.
            // Right-click still shows the context menu (settings panels + quit).
            if let TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                let app = tray.app_handle();
                #[cfg(target_os = "macos")]
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
                if let Some(window) = app.get_webview_window("settings") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
