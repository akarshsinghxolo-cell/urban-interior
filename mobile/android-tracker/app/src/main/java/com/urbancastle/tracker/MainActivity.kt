package com.urbancastle.tracker

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {
  private lateinit var storage: TrackerStorage
  private lateinit var status: TextView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    storage = TrackerStorage(this)
    val code = EditText(this).apply { hint = "15-minute enrollment code" }
    val label = EditText(this).apply { hint = "Device label (for example, Deepak phone)" }
    status = TextView(this)
    val connect = Button(this).apply {
      text = "Connect this phone"
      setOnClickListener {
        status.text = "Connecting…"
        thread {
          runCatching { TrackingApi.enroll(code.text.toString().trim(), label.text.toString().trim(), storage.installationId) }
            .onSuccess {
              storage.token = it.getString("token")
              storage.staffName = it.optString("staffName")
              runOnUiThread { status.text = "Connected to ${storage.staffName}. Grant location permissions to start." }
            }
            .onFailure { error -> runOnUiThread { status.text = error.message ?: "Connection failed." } }
        }
      }
    }
    val start = Button(this).apply {
      text = "Start 24/7 tracking"
      setOnClickListener { requestAndStart() }
    }
    val stop = Button(this).apply {
      text = "Stop tracking"
      setOnClickListener {
        stopService(Intent(this@MainActivity, TrackingService::class.java))
        status.text = "Tracking stopped on this phone."
      }
    }
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(40, 60, 40, 40)
      addView(TextView(this@MainActivity).apply { text = "Urban Castle background tracker" })
      addView(code); addView(label); addView(connect); addView(start); addView(stop); addView(status)
    }
    setContentView(layout)
    status.text = if (storage.token == null) "Not connected." else "Connected to ${storage.staffName ?: "staff"}."
  }

  private fun requestAndStart() {
    if (storage.token == null) {
      status.text = "Connect this phone first."
      return
    }
    val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION)
    if (android.os.Build.VERSION.SDK_INT >= 33) permissions += Manifest.permission.POST_NOTIFICATIONS
    val missing = permissions.filter { ActivityCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
    if (missing.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, missing.toTypedArray(), 41)
      return
    }
    if (android.os.Build.VERSION.SDK_INT >= 29 &&
      ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), 42)
      status.text = "Choose “Allow all the time” so tracking continues when the app is closed."
      return
    }
    ContextCompat.startForegroundService(this, Intent(this, TrackingService::class.java))
    status.text = "Tracking active. Android will show a persistent notification."
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, results)
    if ((requestCode == 41 || requestCode == 42) && results.all { it == PackageManager.PERMISSION_GRANTED }) requestAndStart()
    else status.text = "Precise and background location plus notifications are required."
  }
}
