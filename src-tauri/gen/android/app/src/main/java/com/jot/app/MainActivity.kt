package com.jot.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import com.jot.app.widget.PulseWidget
import com.jot.app.widget.QuickCaptureWidget

class MainActivity : TauriActivity() {
  // Timestamp of the last back press while at the router root, for the
  // press-back-again-to-exit convention.
  private var lastRootBackAt = 0L
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    stashLaunchAction(intent)
    super.onCreate(savedInstanceState)

    // The hardware back button does not reach the WebView by default, so JS
    // (the router) never sees it. Forward it: go back in router history when
    // there is any, otherwise background the app like a normal Android root.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val webView = findWebView(window.decorView)
        if (webView == null) {
          handleRootBack()
          return
        }
        webView.evaluateJavascript(
          "(function(){ if (window.history.length > 1) { window.history.back(); return 'back'; } return 'exit'; })();"
        ) { result ->
          if (result == null || result.contains("exit")) {
            handleRootBack()
          }
        }
      }
    })
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    stashLaunchAction(intent)
  }

  // At the router root, first back warns; a second back within 2s backgrounds
  // the app (like the old behaviour + a standard "press again to exit" hint).
  private fun handleRootBack() {
    val now = System.currentTimeMillis()
    if (now - lastRootBackAt < 2000L) {
      moveTaskToBack(true)
    } else {
      lastRootBackAt = now
      Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT).show()
    }
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        val found = findWebView(view.getChildAt(i))
        if (found != null) return found
      }
    }
    return null
  }

  private fun stashLaunchAction(intent: Intent?) {
    val action = intent?.action ?: return
    if (
      action != QuickCaptureWidget.ACTION_OPEN_CAPTURE &&
      action != QuickCaptureWidget.ACTION_OPEN_VOICE &&
      action != PulseWidget.ACTION_OPEN_PULSE &&
      action != PulseWidget.ACTION_OPEN_ALL
    ) {
      return
    }

    getSharedPreferences("jot_widget_launch", MODE_PRIVATE)
      .edit()
      .putString("pending_action", action)
      .apply()
  }
}
