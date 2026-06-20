package com.jot.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import com.jot.app.R

class PulseWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        appWidgetIds.forEach { id -> updateWidget(context, appWidgetManager, id) }
    }

    companion object {
        const val ACTION_OPEN_PULSE = "com.jot.app.OPEN_PULSE"
        const val ACTION_OPEN_TASK  = "com.jot.app.OPEN_TASK"

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_pulse)

            views.setTextViewText(R.id.pulse_summary, "Open Jot to sync")
            views.setTextViewText(R.id.pulse_count_badge, "—")
            views.setTextViewText(R.id.pulse_empty_title, "Pulse")
            views.setTextViewText(R.id.pulse_empty_quote, "Open Jot once to load tasks")
            views.setTextViewText(R.id.pulse_empty_hint, "")

            views.setViewVisibility(R.id.pulse_list, View.GONE)
            views.setViewVisibility(R.id.pulse_empty_state, View.VISIBLE)
            views.setViewVisibility(R.id.pulse_empty_quote, View.VISIBLE)
            views.setViewVisibility(R.id.pulse_empty_icon, View.GONE)
            views.setViewVisibility(R.id.pulse_empty_hint, View.GONE)

            val openIntent = PendingIntent.getActivity(
                context,
                1,
                Intent(context, mainActivity()).apply {
                    action = ACTION_OPEN_PULSE
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.pulse_header, openIntent)
            views.setOnClickPendingIntent(R.id.pulse_empty_state, openIntent)

            appWidgetManager.updateAppWidget(widgetId, views)
        }

        fun refreshAll(context: Context) {
            val awm = AppWidgetManager.getInstance(context)
            val ids = awm.getAppWidgetIds(ComponentName(context, PulseWidget::class.java))
            ids.forEach { id -> updateWidget(context, awm, id) }
        }

        private fun mainActivity() = Class.forName("com.jot.app.MainActivity")
    }
}
