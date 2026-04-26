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
        const val ACTION_OPEN_TASK = "com.jot.app.OPEN_TASK"

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
            val db = TaskDatabase(context)
            val todayCount = db.getTodayCount()
            val overdueCount = db.getOverdueCount()
            val taskCount = db.getTasks().size
            val sizeClass = sizeClass(appWidgetManager, widgetId)

            val views = RemoteViews(context.packageName, R.layout.widget_pulse)
            views.setTextViewText(R.id.pulse_summary, buildSummary(todayCount, overdueCount))
            views.setTextViewText(R.id.pulse_count_badge, buildCountBadge(todayCount, overdueCount))
            views.setTextViewText(R.id.pulse_empty_title, "All clear")
            views.setTextViewText(R.id.pulse_empty_quote, emptyQuote(sizeClass))
            views.setTextViewText(R.id.pulse_empty_hint, emptyHint(sizeClass, db.getLastSyncMs()))
            views.setViewVisibility(R.id.pulse_list, if (taskCount == 0) View.GONE else View.VISIBLE)
            views.setViewVisibility(R.id.pulse_empty_state, if (taskCount == 0) View.VISIBLE else View.GONE)
            views.setViewVisibility(R.id.pulse_empty_quote, if (sizeClass == SizeClass.SMALL) View.GONE else View.VISIBLE)
            views.setViewVisibility(R.id.pulse_empty_hint, if (sizeClass == SizeClass.LARGE) View.VISIBLE else View.GONE)
            views.setViewVisibility(R.id.pulse_empty_icon, if (sizeClass == SizeClass.LARGE) View.VISIBLE else View.GONE)

            val serviceIntent = Intent(context, PulseWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                data = android.net.Uri.parse("widget://pulse/$widgetId")
            }
            views.setRemoteAdapter(R.id.pulse_list, serviceIntent)

            val taskPending = PendingIntent.getActivity(
                context,
                0,
                Intent(context, mainActivity()).apply {
                    action = ACTION_OPEN_TASK
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            views.setPendingIntentTemplate(R.id.pulse_list, taskPending)

            val openPulsePending = PendingIntent.getActivity(
                context,
                1,
                Intent(context, mainActivity()).apply {
                    action = ACTION_OPEN_PULSE
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.pulse_header, openPulsePending)
            views.setOnClickPendingIntent(R.id.pulse_empty_state, openPulsePending)

            appWidgetManager.updateAppWidget(widgetId, views)
            appWidgetManager.notifyAppWidgetViewDataChanged(widgetId, R.id.pulse_list)
        }

        fun refreshAll(context: Context) {
            val awm = AppWidgetManager.getInstance(context)
            val ids = awm.getAppWidgetIds(ComponentName(context, PulseWidget::class.java))
            ids.forEach { id -> updateWidget(context, awm, id) }
        }

        private fun buildSummary(today: Int, overdue: Int): String = when {
            today == 0 && overdue == 0 -> "Quiet day"
            overdue == 0 -> "$today task${if (today != 1) "s" else ""} today"
            today == 0 -> "$overdue overdue"
            else -> "$today today · $overdue overdue"
        }

        private fun buildCountBadge(today: Int, overdue: Int): String = when {
            today == 0 && overdue == 0 -> "Done"
            overdue == 0 -> "$today today"
            today == 0 -> "$overdue late"
            else -> "${today + overdue} focus"
        }

        private fun emptyQuote(sizeClass: SizeClass): String = when (sizeClass) {
            SizeClass.SMALL -> "Nothing due right now."
            SizeClass.MEDIUM -> "\"Here's looking at you, empty inbox.\""
            SizeClass.LARGE -> "\"All quiet on the western front.\""
        }

        private fun emptyHint(sizeClass: SizeClass, lastSyncMs: Long): String {
            if (sizeClass != SizeClass.LARGE) return ""
            return if (lastSyncMs > 0L) {
                "Freshly synced and ready for the next thought."
            } else {
                "Open Jot once to prime today's snapshot."
            }
        }

        private fun sizeClass(appWidgetManager: AppWidgetManager, widgetId: Int): SizeClass {
            val options = appWidgetManager.getAppWidgetOptions(widgetId)
            val maxHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
            return when {
                maxHeight >= 220 -> SizeClass.LARGE
                maxHeight >= 120 -> SizeClass.MEDIUM
                else -> SizeClass.SMALL
            }
        }

        private fun mainActivity() = Class.forName("com.jot.app.MainActivity")
    }

    enum class SizeClass { SMALL, MEDIUM, LARGE }
}
