package com.jot.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import com.jot.app.R

class PulseWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        // Diagnostic: delegate entirely to QuickCaptureWidget's known-working code + layout.
        // If this renders, the problem is in PulseWidget's own layouts/code.
        // If this still fails, the problem is in the manifest registration or metadata.
        appWidgetIds.forEach { id ->
            QuickCaptureWidget.updateWidget(context, appWidgetManager, id)
        }
    }

    companion object {
        const val ACTION_OPEN_PULSE = "com.jot.app.OPEN_PULSE"
        const val ACTION_OPEN_TASK  = "com.jot.app.OPEN_TASK"

        fun refreshAll(context: Context) {
            val awm = AppWidgetManager.getInstance(context)
            val ids = awm.getAppWidgetIds(ComponentName(context, PulseWidget::class.java))
            ids.forEach { id -> QuickCaptureWidget.updateWidget(context, awm, id) }
        }
    }
}
