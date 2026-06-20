package com.jot.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import com.jot.app.R

class PulseWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        appWidgetIds.forEach { id ->
            // Show "alive" immediately using the zero-dependency debug layout.
            // If even this doesn't render, the problem is at a level below our code.
            showDebug(context, appWidgetManager, id, "onUpdate called — layout loading…")
            try {
                renderStatic(context, appWidgetManager, id)
            } catch (e: Throwable) {
                showDebug(context, appWidgetManager, id, "ERR ${e.javaClass.simpleName}: ${e.message}")
            }
        }
    }

    companion object {
        const val ACTION_OPEN_PULSE = "com.jot.app.OPEN_PULSE"
        const val ACTION_OPEN_TASK  = "com.jot.app.OPEN_TASK"

        fun refreshAll(context: Context) {
            val awm = AppWidgetManager.getInstance(context)
            val ids = awm.getAppWidgetIds(ComponentName(context, PulseWidget::class.java))
            ids.forEach { id ->
                showDebug(context, awm, id, "refreshAll called")
                try {
                    renderStatic(context, awm, id)
                } catch (e: Throwable) {
                    showDebug(context, awm, id, "ERR ${e.javaClass.simpleName}: ${e.message}")
                }
            }
        }

        private fun showDebug(context: Context, awm: AppWidgetManager, id: Int, message: String) {
            try {
                val views = RemoteViews(context.packageName, R.layout.widget_pulse_debug)
                views.setTextViewText(R.id.debug_text, message)
                awm.updateAppWidget(id, views)
            } catch (_: Throwable) {
                // Even the debug layout failed — nothing we can surface without logcat
            }
        }

        private fun renderStatic(context: Context, awm: AppWidgetManager, id: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_pulse)
            views.setTextViewText(R.id.pulse_summary, "Open Jot to sync")
            views.setTextViewText(R.id.pulse_count_badge, "—")
            views.setTextViewText(R.id.pulse_empty_title, "Pulse")
            views.setTextViewText(R.id.pulse_empty_quote, "Open Jot once to load tasks")
            views.setTextViewText(R.id.pulse_empty_hint, "")
            views.setViewVisibility(R.id.pulse_list, android.view.View.GONE)
            views.setViewVisibility(R.id.pulse_empty_state, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.pulse_empty_quote, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.pulse_empty_icon, android.view.View.GONE)
            views.setViewVisibility(R.id.pulse_empty_hint, android.view.View.GONE)
            awm.updateAppWidget(id, views)
        }
    }
}
