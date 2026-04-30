// widget_sync.rs
//
// Tauri command: sync_widget_db
//
// Called from TypeScript after any task mutation or on app foreground.
// Writes a denormalized snapshot to jot_widget.db so Android home-screen
// widgets can read task data without a network call and without the app open.
//
// On desktop the command is a no-op after the DB write (no widgets exist).
// On Android it also sends a broadcast so the widgets redraw immediately.

use rusqlite::{params, Connection};
use serde::Deserialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
#[cfg(target_os = "android")]
use jni::objects::{JObject, JValue};

// ── Payload types (match the TypeScript widgetSync.ts shape) ─────────────────

#[derive(Debug, Deserialize)]
pub struct WidgetTask {
    pub id: String,
    pub title: String,
    pub due_date: String,
    pub due_time: Option<String>,
    pub priority: String,
    pub project_name: Option<String>,
    pub is_overdue: bool,
    pub display_order: i32,
}

#[derive(Debug, Deserialize)]
pub struct SyncPayload {
    pub tasks: Vec<WidgetTask>,
    pub today_count: i32,
    pub overdue_count: i32,
}

// ── Command ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn sync_widget_db(app: AppHandle, payload: SyncPayload) -> Result<(), String> {
    let db_path = widget_db_path(&app)?;

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS pulse_tasks (
            id            TEXT    PRIMARY KEY,
            title         TEXT    NOT NULL,
            due_date      TEXT    NOT NULL,
            due_time      TEXT,
            priority      TEXT    NOT NULL DEFAULT 'none',
            project_name  TEXT,
            is_overdue    INTEGER NOT NULL DEFAULT 0,
            display_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS widget_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )
    .map_err(|e| e.to_string())?;

    // Atomic snapshot — delete then re-insert in one transaction so the widget
    // never reads a half-written state.
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM pulse_tasks", [])
        .map_err(|e| e.to_string())?;

    for task in &payload.tasks {
        tx.execute(
            r#"INSERT OR REPLACE INTO pulse_tasks
               (id, title, due_date, due_time, priority, project_name, is_overdue, display_order)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
            params![
                task.id,
                task.title,
                task.due_date,
                task.due_time,
                task.priority,
                task.project_name,
                task.is_overdue as i32,
                task.display_order,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .to_string();

    for (key, value) in [
        ("last_sync_ms",  now_ms.as_str()),
        ("today_count",   &payload.today_count.to_string()),
        ("overdue_count", &payload.overdue_count.to_string()),
    ] {
        tx.execute(
            "INSERT OR REPLACE INTO widget_meta (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    #[cfg(target_os = "android")]
    trigger_widget_refresh(&app)?;

    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Resolves to <filesDir>/databases/jot_widget.db — the same path
/// TaskDatabase.kt uses via context.filesDir on Android.
fn widget_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    Ok(base.join("databases").join("jot_widget.db"))
}

#[cfg(target_os = "android")]
fn trigger_widget_refresh(app: &AppHandle) -> Result<(), String> {
    let window = match app.get_webview_window("main") {
        Some(window) => window,
        None => return Ok(()),
    };
    let (tx, rx) = std::sync::mpsc::channel();

    window
        .with_webview(move |webview: tauri::webview::PlatformWebview| {
            webview.jni_handle().exec(
                move |
                    env: &mut jni::JNIEnv<'_>,
                    activity: &JObject<'_>,
                    _webview: &JObject<'_>,
                | {
                    let result = (|| -> Result<(), jni::errors::Error> {
                        let intent_class = env.find_class("android/content/Intent")?;
                        let action = env.new_string("com.jot.app.UPDATE_WIDGETS")?;
                        let intent = env.new_object(
                            intent_class,
                            "(Ljava/lang/String;)V",
                            &[JValue::Object(&JObject::from(action))],
                        )?;

                        env.call_method(
                            activity,
                            "sendBroadcast",
                            "(Landroid/content/Intent;)V",
                            &[JValue::Object(&intent)],
                        )?;

                        Ok(())
                    })();

                    let _ = tx.send(result.map_err(|err| err.to_string()));
                },
            );
        })
        .map_err(|err| err.to_string())?;

    rx.recv().map_err(|err| err.to_string())?
}
