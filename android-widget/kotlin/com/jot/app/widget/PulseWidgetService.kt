// Destination: src-tauri/gen/android/app/src/main/kotlin/com/jot/app/widget/PulseWidgetService.kt
package com.jot.app.widget

import android.content.Intent
import android.widget.RemoteViewsService

class PulseWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        PulseWidgetFactory(applicationContext, intent)
}
