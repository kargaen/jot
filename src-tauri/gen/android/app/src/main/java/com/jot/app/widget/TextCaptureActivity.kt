// Destination: src-tauri/gen/android/app/src/main/java/com/jot/app/widget/TextCaptureActivity.kt
package com.jot.app.widget

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.jot.app.R

class TextCaptureActivity : AppCompatActivity() {

    private val REQUEST_SPEECH = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE or
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,
        )
        setContentView(R.layout.activity_text_capture)

        val input = findViewById<EditText>(R.id.capture_input)
        val submit = findViewById<Button>(R.id.capture_submit)
        val cancel = findViewById<Button>(R.id.capture_cancel)
        val mic = findViewById<ImageButton>(R.id.capture_mic)

        input.requestFocus()

        mic.setOnClickListener {
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PROMPT, "What needs to get done?")
            }
            try {
                startActivityForResult(intent, REQUEST_SPEECH)
            } catch (_: Exception) {
                Toast.makeText(this, "Speech recognition not available", Toast.LENGTH_SHORT).show()
            }
        }

        submit.setOnClickListener {
            val text = input.text.toString().trim()
            if (text.isNotEmpty()) {
                CaptureOutbox.enqueue(this, text, "text")
                Toast.makeText(this, "Captured", Toast.LENGTH_SHORT).show()
            }
            finish()
        }

        cancel.setOnClickListener { finish() }
    }

    @Deprecated("Required for API < 29 compat")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_SPEECH && resultCode == Activity.RESULT_OK) {
            val spoken = data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()?.trim() ?: return
            val input = findViewById<EditText>(R.id.capture_input)
            val current = input.text.toString().trim()
            // Append to existing text so a typed prefix is preserved
            input.setText(if (current.isEmpty()) spoken else "$current $spoken")
            input.setSelection(input.text.length)
        }
    }
}
