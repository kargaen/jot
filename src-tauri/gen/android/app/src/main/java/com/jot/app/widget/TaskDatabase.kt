// Destination: src-tauri/gen/android/app/src/main/kotlin/com/jot/app/widget/TaskDatabase.kt
package com.jot.app.widget

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.File

data class PulseTask(
    val id: String,
    val title: String,
    val dueDate: String,
    val dueTime: String?,
    val priority: String,
    val projectName: String?,
    val isOverdue: Boolean,
    val displayOrder: Int,
)

// Database lives at <filesDir>/databases/jot_widget.db — same path the Rust
// widget_sync command resolves via app.path().app_data_dir().
class TaskDatabase(context: Context) : SQLiteOpenHelper(
    context.applicationContext,
    databasePath(context),
    null,
    DB_VERSION,
) {
    companion object {
        const val DB_VERSION  = 1
        const val TABLE_TASKS = "pulse_tasks"
        const val TABLE_META  = "widget_meta"

        private fun databasePath(context: Context): String {
            val directory = File(context.filesDir, "databases")
            if (!directory.exists()) {
                directory.mkdirs()
            }
            return File(directory, "jot_widget.db").absolutePath
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS $TABLE_TASKS (
                id            TEXT    PRIMARY KEY,
                title         TEXT    NOT NULL,
                due_date      TEXT    NOT NULL,
                due_time      TEXT,
                priority      TEXT    NOT NULL DEFAULT 'none',
                project_name  TEXT,
                is_overdue    INTEGER NOT NULL DEFAULT 0,
                display_order INTEGER NOT NULL DEFAULT 0
            )
        """.trimIndent())
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS $TABLE_META (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """.trimIndent())
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_TASKS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_META")
        onCreate(db)
    }

    fun getTasks(): List<PulseTask> {
        val cursor = readableDatabase.query(
            TABLE_TASKS, null, null, null, null, null,
            "is_overdue DESC, due_time ASC NULLS LAST, display_order ASC",
        )
        return cursor.use {
            buildList {
                while (it.moveToNext()) {
                    add(PulseTask(
                        id           = it.getString(it.getColumnIndexOrThrow("id")),
                        title        = it.getString(it.getColumnIndexOrThrow("title")),
                        dueDate      = it.getString(it.getColumnIndexOrThrow("due_date")),
                        dueTime      = it.getString(it.getColumnIndexOrThrow("due_time")),
                        priority     = it.getString(it.getColumnIndexOrThrow("priority")),
                        projectName  = it.getString(it.getColumnIndexOrThrow("project_name")),
                        isOverdue    = it.getInt(it.getColumnIndexOrThrow("is_overdue")) == 1,
                        displayOrder = it.getInt(it.getColumnIndexOrThrow("display_order")),
                    ))
                }
            }
        }
    }

    private fun getMeta(key: String): String? {
        val cursor = readableDatabase.query(
            TABLE_META, arrayOf("value"), "key = ?", arrayOf(key), null, null, null,
        )
        return cursor.use { if (it.moveToFirst()) it.getString(0) else null }
    }

    fun getTodayCount(): Int   = getMeta("today_count")?.toIntOrNull()   ?: 0
    fun getOverdueCount(): Int = getMeta("overdue_count")?.toIntOrNull() ?: 0
    fun getLastSyncMs(): Long  = getMeta("last_sync_ms")?.toLongOrNull() ?: 0L
}
