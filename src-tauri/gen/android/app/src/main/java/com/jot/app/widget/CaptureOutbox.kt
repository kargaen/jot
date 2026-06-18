// Destination: src-tauri/gen/android/app/src/main/java/com/jot/app/widget/CaptureOutbox.kt
package com.jot.app.widget

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.File
import java.util.UUID

data class CaptureItem(
    val id: String,
    val text: String,
    val source: String,
    val createdAt: String,
)

class CaptureOutbox private constructor(context: Context) : SQLiteOpenHelper(
    context.applicationContext,
    File(context.filesDir, "capture_outbox.db").absolutePath,
    null,
    VERSION,
) {
    companion object {
        private const val VERSION = 1
        private const val TABLE = "capture_queue"

        fun enqueue(context: Context, text: String, source: String) {
            CaptureOutbox(context).writableDatabase.use { db ->
                db.execSQL(
                    "INSERT INTO $TABLE (id, text, source, created_at) VALUES (?, ?, ?, datetime('now'))",
                    arrayOf(UUID.randomUUID().toString(), text, source),
                )
            }
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS $TABLE (
                id         TEXT PRIMARY KEY,
                text       TEXT NOT NULL,
                source     TEXT NOT NULL DEFAULT 'text',
                created_at TEXT NOT NULL
            )
            """.trimIndent(),
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE")
        onCreate(db)
    }
}
