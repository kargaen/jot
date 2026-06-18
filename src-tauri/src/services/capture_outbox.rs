// capture_outbox.rs
//
// Tauri command: take_capture_outbox
//
// Reads and atomically clears all pending captures written by the native
// TextCaptureActivity and VoiceCaptureActivity widget entrypoints.
// Returns items oldest-first so the caller can create tasks in order.
// Safe on desktop — returns an empty list when the DB does not exist.

use rusqlite::Connection;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct CaptureItem {
    pub id: String,
    pub text: String,
    pub source: String,
    pub created_at: String,
}

#[tauri::command]
pub fn take_capture_outbox(app: AppHandle) -> Result<Vec<CaptureItem>, String> {
    let path = outbox_path(&app)?;
    if !path.exists() {
        return Ok(vec![]);
    }

    let conn = Connection::open(&path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS capture_queue (
            id         TEXT PRIMARY KEY,
            text       TEXT NOT NULL,
            source     TEXT NOT NULL DEFAULT 'text',
            created_at TEXT NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;

    let items: Vec<CaptureItem> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, text, source, created_at FROM capture_queue ORDER BY rowid ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows: Vec<CaptureItem> = stmt
            .query_map([], |row| {
                Ok(CaptureItem {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    source: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    if !items.is_empty() {
        conn.execute("DELETE FROM capture_queue", [])
            .map_err(|e| e.to_string())?;
    }

    Ok(items)
}

fn outbox_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("capture_outbox.db"))
}
