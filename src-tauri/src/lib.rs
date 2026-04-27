pub mod widget_sync;

#[cfg(target_os = "android")]
use jni::objects::{JObject, JString, JValue};
use tauri::Manager;
#[cfg(desktop)]
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter,
};
#[cfg(all(desktop, not(debug_assertions)))]
use tauri_plugin_autostart::ManagerExt;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

// ─── Window helpers (desktop only) ───────────────────────────────────────────

#[cfg(desktop)]
fn show_qc(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("quick-capture") {
        let _ = win.center();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[cfg(desktop)]
fn hide_qc(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("quick-capture") {
        let _ = win.hide();
    }
}

#[cfg(desktop)]
fn toggle_qc(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("quick-capture") {
        let is_visible = win.is_visible().unwrap_or(false);
        let is_focused = win.is_focused().unwrap_or(false);
        if is_visible && is_focused {
            hide_qc(app);
        } else {
            show_qc(app);
        }
    }
}

#[cfg(desktop)]
#[tauri::command]
fn hide_quick_capture(app: tauri::AppHandle) {
    hide_qc(&app);
}

#[cfg(desktop)]
#[tauri::command]
fn show_quick_capture(app: tauri::AppHandle) {
    show_qc(&app);
}

#[cfg(desktop)]
#[tauri::command]
fn open_dashboard(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        hide_qc(&app);
    }
}

// ─── Idle detection (Windows only) ───────────────────────────────────────────

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

// ─── Vibrancy (desktop only) ──────────────────────────────────────────────────

#[cfg(desktop)]
#[tauri::command]
fn apply_vibrancy(window: tauri::WebviewWindow) -> bool {
    window_vibrancy::apply_mica(&window, None).is_ok()
}

// ─── Shared commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn log_to_terminal(level: String, line: String) {
    match level.as_str() {
        "error" => eprintln!("[ERR] {}", line),
        "warn"  => eprintln!("[WRN] {}", line),
        "debug" => println!("[DBG] {}", line),
        _       => println!("[INF] {}", line),
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

#[tauri::command]
fn take_mobile_launch_action(app: tauri::AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "android")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "main webview not available".to_string())?;
        let (tx, rx) = std::sync::mpsc::channel();

        window
            .with_webview(move |webview: tauri::webview::PlatformWebview| {
                webview.jni_handle().exec(
                    move |
                        env: &mut jni::JNIEnv<'_>,
                        activity: &JObject<'_>,
                        _webview: &JObject<'_>,
                    | {
                    let result = (|| -> Result<Option<String>, jni::errors::Error> {
                        let prefs_name = env.new_string("jot_widget_launch")?;
                        let key = env.new_string("pending_action")?;
                        let prefs_name_obj = JObject::from(prefs_name);
                        let key_obj = JObject::from(key);

                        let prefs = env
                            .call_method(
                                activity,
                                "getSharedPreferences",
                                "(Ljava/lang/String;I)Landroid/content/SharedPreferences;",
                                &[JValue::Object(&prefs_name_obj), JValue::Int(0)],
                            )
                            ?
                            .l()?;

                        let action_obj = env
                            .call_method(
                                &prefs,
                                "getString",
                                "(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;",
                                &[JValue::Object(&key_obj), JValue::Object(&JObject::null())],
                            )
                            ?
                            .l()?;

                        let null = JObject::null();
                        let action = if env.is_same_object(&action_obj, &null)? {
                            None
                        } else {
                            let raw = env
                                .get_string(&JString::from(action_obj))
                                ?
                                .to_string_lossy()
                                .into_owned();
                            match raw.as_str() {
                                "com.jot.app.OPEN_CAPTURE" => Some("capture".to_string()),
                                "com.jot.app.OPEN_VOICE_CAPTURE" => Some("voice".to_string()),
                                "com.jot.app.OPEN_PULSE" => Some("pulse".to_string()),
                                _ => None,
                            }
                        };

                        let editor = env
                            .call_method(
                                &prefs,
                                "edit",
                                "()Landroid/content/SharedPreferences$Editor;",
                                &[],
                            )
                            ?
                            .l()?;
                        env.call_method(
                            &editor,
                            "remove",
                            "(Ljava/lang/String;)Landroid/content/SharedPreferences$Editor;",
                            &[JValue::Object(&key_obj)],
                        )
                        ?;
                        env.call_method(&editor, "apply", "()V", &[])?;

                        Ok(action)
                    })();

                    let _ = tx.send(result.map_err(|e| e.to_string()));
                });
            })
            .map_err(|e| e.to_string())?;

        return rx.recv().map_err(|e| e.to_string())?;
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(None)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init());

    builder
        .setup(|_app| {
            #[cfg(desktop)]
            {
                let app = _app;
                let item_capture =
                    MenuItemBuilder::with_id("capture", "New Task  Ctrl+Space").build(app)?;
                let item_dashboard =
                    MenuItemBuilder::with_id("dashboard", "Open Dashboard").build(app)?;
                let item_pulse =
                    MenuItemBuilder::with_id("pulse", "Today's Pulse").build(app)?;
                let item_about = MenuItemBuilder::with_id("about", "About Jot").build(app)?;
                let item_quit = MenuItemBuilder::with_id("quit", "Quit Jot").build(app)?;

                let menu = MenuBuilder::new(app)
                    .item(&item_capture)
                    .item(&item_dashboard)
                    .item(&item_pulse)
                    .separator()
                    .item(&item_about)
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
                        "about" => {
                            if let Some(win) = app.get_webview_window("about") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
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

                #[cfg(not(debug_assertions))]
                {
                    if let Ok(data_dir) = app.path().app_data_dir() {
                        let flag = data_dir.join(".autostart_initialized");
                        if !flag.exists() {
                            let mgr = app.autolaunch();
                            let _ = mgr.enable();
                            let _ = std::fs::create_dir_all(&data_dir);
                            let _ = std::fs::write(&flag, "");
                        }
                    }
                }

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
            }

            Ok(())
        })
        .invoke_handler({
            #[cfg(desktop)]
            { tauri::generate_handler![
                hide_quick_capture,
                show_quick_capture,
                open_dashboard,
                apply_vibrancy,
                log_to_terminal,
                get_idle_ms,
                take_mobile_launch_action,
                widget_sync::sync_widget_db,
            ]}
            #[cfg(not(desktop))]
            { tauri::generate_handler![
                log_to_terminal,
                get_idle_ms,
                take_mobile_launch_action,
                widget_sync::sync_widget_db,
            ]}
        })
        .run(tauri::generate_context!())
        .expect("error while running Jot")
}
