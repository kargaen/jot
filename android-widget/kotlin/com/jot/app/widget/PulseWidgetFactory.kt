// Destination: src-tauri/gen/android/app/src/main/kotlin/com/jot/app/widget/PulseWidgetFactory.kt
package com.jot.app.widget

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.jot.app.R

class PulseWidgetFactory(
    private val context: Context,
    intent: Intent,
) : RemoteViewsService.RemoteViewsFactory {

    private var tasks: List<PulseTask> = emptyList()

    override fun onCreate() {}
    override fun onDestroy() {}

    override fun onDataSetChanged() {
        tasks = TaskDatabase(context).getTasks()
    }

    override fun getCount(): Int = tasks.size

    override fun getViewAt(position: Int): RemoteViews {
        if (position >= tasks.size) return loadingView()
        val task  = tasks[position]
        val views = RemoteViews(context.packageName, R.layout.widget_pulse_item)

        views.setTextViewText(R.id.item_title, task.title)
        views.setTextColor(
            R.id.item_title,
            if (task.isOverdue) COLOR_OVERDUE else COLOR_NORMAL,
        )
        views.setTextViewText(R.id.item_meta, buildMeta(task))
        views.setInt(R.id.item_priority_dot, "setColorFilter", priorityColor(task.priority))

        // Fill intent carries task_id; merged with PendingIntentTemplate in PulseWidget
        views.setOnClickFillInIntent(
            R.id.item_root,
            Intent().apply { putExtra("task_id", task.id) },
        )
        return views
    }

    override fun getLoadingView(): RemoteViews = loadingView()
    override fun getViewTypeCount(): Int  = 1
    override fun getItemId(pos: Int): Long = tasks[pos].id.hashCode().toLong()
    override fun hasStableIds(): Boolean  = true

    private fun buildMeta(task: PulseTask): String {
        val parts = mutableListOf<String>()
        when {
            task.isOverdue       -> parts.add("overdue")
            task.dueTime != null -> parts.add(task.dueTime)
        }
        task.projectName?.let { parts.add(it) }
        return parts.joinToString(" · ")
    }

    private fun priorityColor(priority: String): Int = when (priority) {
        "high"   -> COLOR_HIGH
        "medium" -> COLOR_MEDIUM
        "low"    -> COLOR_LOW
        else     -> COLOR_NONE
    }

    private fun loadingView() =
        RemoteViews(context.packageName, R.layout.widget_pulse_item).also {
            it.setTextViewText(R.id.item_title, "Loading…")
            it.setTextViewText(R.id.item_meta, "")
        }

    companion object {
        private val COLOR_OVERDUE = Color.parseColor("#E53935")
        private val COLOR_NORMAL  = Color.parseColor("#212121")
        private val COLOR_HIGH    = Color.parseColor("#E53935")
        private val COLOR_MEDIUM  = Color.parseColor("#FB8C00")
        private val COLOR_LOW     = Color.parseColor("#43A047")
        private val COLOR_NONE    = Color.parseColor("#BDBDBD")
    }
}
