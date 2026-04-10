#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn show_qc(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("quick-capture") {
        let _ = win.center();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn hide_qc(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("quick-capture") {
        let _ = win.hide();
    }
}

fn toggle_qc(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("quick-capture") {
        if win.is_visible().unwrap_or(false) {
            hide_qc(app);
        } else {
            show_qc(app);
        }
    }
}

#[tauri::command]
fn hide_quick_capture(app: tauri::AppHandle) {
    hide_qc(&app);
}

#[tauri::command]
fn show_quick_capture(app: tauri::AppHandle) {
    show_qc(&app);
}

// ─── Idle detection ───────────────────────────────────────────────────────────
// Returns milliseconds since the last keyboard/mouse input anywhere on the system.
// Used by the reminder popup to pause its countdown when the user is away.
#[cfg(windows)]
mod idle_win {
    #[repr(C)]
    struct LastInputInfo {
        cb_size: u32,
        dw_time: u32,
    }
    extern "system" {
        fn GetLastInputInfo(plii: *mut LastInputInfo) -> i32;
        fn GetTickCount() -> u32;
    }
    pub fn idle_ms() -> u32 {
        unsafe {
            let mut info = LastInputInfo {
                cb_size: std::mem::size_of::<LastInputInfo>() as u32,
                dw_time: 0,
            };
            GetLastInputInfo(&mut info);
            GetTickCount().wrapping_sub(info.dw_time)
        }
    }
}

#[tauri::command]
fn get_idle_ms() -> u32 {
    #[cfg(windows)]
    { idle_win::idle_ms() }
    #[cfg(not(windows))]
    { 0 }
}

/// Apply Mica backdrop (Windows 11+ only). Returns true on success.
#[tauri::command]
fn apply_vibrancy(window: tauri::WebviewWindow) -> bool {
    window_vibrancy::apply_mica(&window, None).is_ok()
}

#[tauri::command]
fn log_to_terminal(level: String, line: String) {
    match level.as_str() {
        "error" => eprintln!("[ERR] {}", line),
        "warn"  => eprintln!("[WRN] {}", line),
        "debug" => println!("[DBG] {}", line),
        _       => println!("[INF] {}", line),
    }
}

#[tauri::command]
fn open_dashboard(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        hide_qc(&app);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let item_capture =
                MenuItemBuilder::with_id("capture", "New Task  Ctrl+Space").build(app)?;
            let item_dashboard =
                MenuItemBuilder::with_id("dashboard", "Open Dashboard").build(app)?;
            let item_pulse =
                MenuItemBuilder::with_id("pulse", "Today's Pulse").build(app)?;
            let item_quit = MenuItemBuilder::with_id("quit", "Quit Jot").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&item_capture)
                .item(&item_dashboard)
                .item(&item_pulse)
                .separator()
                .item(&item_quit)
                .build()?;

            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Jot")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "capture" => toggle_qc(app),
                    "dashboard" => open_dashboard(app.clone()),
                    "pulse" => { let _ = app.emit("show-reminder", ()); }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            toggle_qc(tray.app_handle());
                        }
                        TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        } => {
                            open_dashboard(tray.app_handle().clone());
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            let handle = app.handle().clone();
            app.global_shortcut().on_shortcut(
                Shortcut::new(Some(Modifiers::CONTROL), Code::Space),
                move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_qc(&handle);
                    }
                },
            )?;

            if let Some(win) = app.get_webview_window("main") {
                let _ = win.hide();
                let win_clone = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hide_quick_capture,
            show_quick_capture,
            open_dashboard,
            apply_vibrancy,
            log_to_terminal,
            get_idle_ms
        ])
        .run(tauri::generate_context!())
        .expect("error while running Jot")
}
