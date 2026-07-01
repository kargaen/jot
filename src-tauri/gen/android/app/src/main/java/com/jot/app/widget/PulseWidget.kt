package com.jot.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
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

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) refreshAll(context)
    }

    companion object {
        const val ACTION_OPEN_PULSE = "com.jot.app.OPEN_PULSE"
        const val ACTION_OPEN_TASK  = "com.jot.app.OPEN_TASK"
        const val ACTION_OPEN_ALL   = "com.jot.app.OPEN_ALL"
        const val ACTION_REFRESH    = "com.jot.app.PULSE_REFRESH"

        // Calm empty-state assets, mirroring the app's relax.ts.
        private val RELAX_QUOTES = listOf(
            "Enjoy the quiet. It counts too.",
            "No rush. The day has room.",
            "Clear skies, clear list.",
            "A quiet Pulse is still progress.",
            "Nothing due right now. Breathe.",
        )
        private val RELAX_IMAGES = listOf(
            R.drawable.zen_beach1, R.drawable.zen_beach2, R.drawable.zen_beach3,
            R.drawable.zen_beach4, R.drawable.zen_beach5, R.drawable.zen_beach6,
            R.drawable.zen_beach7,
        )

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
            val db = TaskDatabase(context)
            val todayCount = db.getTodayCount()
            val overdueCount = db.getOverdueCount()
            val taskCount = db.getTasks().size
            val sizeClass = sizeClass(appWidgetManager, widgetId)

            val views = RemoteViews(context.packageName, R.layout.widget_pulse)
            views.setTextViewText(R.id.pulse_summary, buildSummary(todayCount, overdueCount))
            views.setTextViewText(R.id.pulse_empty_title, "All clear")
            // App-parity empty state: a random calm image + quote (mirrors relax.ts).
            views.setImageViewResource(R.id.pulse_empty_image, RELAX_IMAGES.random())
            views.setTextViewText(R.id.pulse_empty_quote, RELAX_QUOTES.random())
            // TEMP diagnostic: does the widget DB exist at the read path, and how
            // many rows? Reveals whether the app's sync path matches this one.
            val dbFile = java.io.File(context.filesDir, "databases/jot_widget.db")
            views.setTextViewText(
                R.id.pulse_empty_hint,
                "sync: ${if (dbFile.exists()) "file OK" else "NO FILE"} · rows=$taskCount · last=${db.getLastSyncMs()}",
            )

            views.setViewVisibility(R.id.pulse_list, if (taskCount == 0) View.GONE else View.VISIBLE)
            views.setViewVisibility(R.id.pulse_empty_state, if (taskCount == 0) View.VISIBLE else View.GONE)
            views.setViewVisibility(R.id.pulse_empty_quote, if (sizeClass == SizeClass.SMALL) View.GONE else View.VISIBLE)
            views.setViewVisibility(R.id.pulse_empty_hint, if (sizeClass == SizeClass.SMALL) View.GONE else View.VISIBLE)
            views.setViewVisibility(R.id.pulse_empty_image, if (sizeClass == SizeClass.SMALL) View.GONE else View.VISIBLE)
            views.setViewVisibility(R.id.pulse_empty_icon, View.GONE)

            val serviceIntent = Intent(context, PulseWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                data = Uri.parse("widget://pulse/$widgetId")
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

            // Deeplink buttons open the app at the matching route; refresh re-reads
            // the local snapshot and redraws.
            views.setOnClickPendingIntent(R.id.pulse_btn_capture, launchPending(context, 2, QuickCaptureWidget.ACTION_OPEN_CAPTURE))
            views.setOnClickPendingIntent(R.id.pulse_btn_today, launchPending(context, 3, ACTION_OPEN_PULSE))
            views.setOnClickPendingIntent(R.id.pulse_btn_all, launchPending(context, 4, ACTION_OPEN_ALL))
            views.setOnClickPendingIntent(
                R.id.pulse_btn_refresh,
                PendingIntent.getBroadcast(
                    context,
                    10,
                    Intent(context, PulseWidget::class.java).apply { action = ACTION_REFRESH },
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )

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

        private fun launchPending(context: Context, requestCode: Int, action: String): PendingIntent =
            PendingIntent.getActivity(
                context,
                requestCode,
                Intent(context, mainActivity()).apply {
                    this.action = action
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        private fun sizeClass(appWidgetManager: AppWidgetManager, widgetId: Int): SizeClass {
            val options = appWidgetManager.getAppWidgetOptions(widgetId)
            val maxHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
            return when {
                maxHeight >= 220 -> SizeClass.LARGE
                maxHeight >= 120 -> SizeClass.MEDIUM
                else             -> SizeClass.SMALL
            }
        }

        private fun mainActivity() = Class.forName("com.jot.app.MainActivity")
    }

    enum class SizeClass { SMALL, MEDIUM, LARGE }
}
