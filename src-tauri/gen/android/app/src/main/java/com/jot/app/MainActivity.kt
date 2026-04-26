package com.jot.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import com.jot.app.widget.PulseWidget
import com.jot.app.widget.QuickCaptureWidget

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    stashLaunchAction(intent)
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    stashLaunchAction(intent)
  }

  private fun stashLaunchAction(intent: Intent?) {
    val action = intent?.action ?: return
    if (
      action != QuickCaptureWidget.ACTION_OPEN_CAPTURE &&
      action != QuickCaptureWidget.ACTION_OPEN_VOICE &&
      action != PulseWidget.ACTION_OPEN_PULSE
    ) {
      return
    }

    getSharedPreferences("jot_widget_launch", MODE_PRIVATE)
      .edit()
      .putString("pending_action", action)
      .apply()
  }
}
