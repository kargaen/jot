// Destination: src-tauri/gen/android/app/src/main/java/com/jot/app/widget/TextCaptureActivity.kt
package com.jot.app.widget

import android.os.Bundle
import android.view.Window
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.jot.app.R

class TextCaptureActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE)
        window.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE or
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN,
        )
        setContentView(R.layout.activity_text_capture)

        val input = findViewById<EditText>(R.id.capture_input)
        val submit = findViewById<Button>(R.id.capture_submit)
        val cancel = findViewById<Button>(R.id.capture_cancel)

        input.requestFocus()

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
}
