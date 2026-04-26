// Destination: src-tauri/gen/android/app/src/main/kotlin/com/jot/app/widget/WidgetUpdateReceiver.kt
package com.jot.app.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Receives the broadcast sent by widget_sync.rs after writing the DB.
class WidgetUpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION) return
        QuickCaptureWidget.refreshAll(context)
        PulseWidget.refreshAll(context)
    }

    companion object {
        const val ACTION = "com.jot.app.UPDATE_WIDGETS"

        fun trigger(context: Context) {
            context.sendBroadcast(
                Intent(context, WidgetUpdateReceiver::class.java).apply { action = ACTION },
            )
        }
    }
}
