// Destination: src-tauri/gen/android/app/src/main/kotlin/com/jot/app/widget/QuickCaptureWidget.kt
package com.jot.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.jot.app.R

class QuickCaptureWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        appWidgetIds.forEach { id -> updateWidget(context, appWidgetManager, id) }
    }

    companion object {
        const val ACTION_OPEN_CAPTURE = "com.jot.app.OPEN_CAPTURE"
        const val ACTION_OPEN_VOICE   = "com.jot.app.OPEN_VOICE_CAPTURE"

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_quick_capture)

            // Tap field → open app Capture tab with keyboard raised
            views.setOnClickPendingIntent(
                R.id.capture_field,
                PendingIntent.getActivity(
                    context, widgetId * 2,
                    Intent(context, mainActivity()).apply {
                        action = ACTION_OPEN_CAPTURE
                        flags  = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    },
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )

            // Tap mic → open Capture tab with voice input
            views.setOnClickPendingIntent(
                R.id.capture_button,
                PendingIntent.getActivity(
                    context, widgetId * 2 + 1,
                    Intent(context, mainActivity()).apply {
                        action = ACTION_OPEN_VOICE
                        flags  = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    },
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )

            appWidgetManager.updateAppWidget(widgetId, views)
        }

        fun refreshAll(context: Context) {
            val awm = AppWidgetManager.getInstance(context)
            val ids = awm.getAppWidgetIds(ComponentName(context, QuickCaptureWidget::class.java))
            ids.forEach { id -> updateWidget(context, awm, id) }
        }

        private fun mainActivity() = Class.forName("com.jot.app.MainActivity")
    }
}
