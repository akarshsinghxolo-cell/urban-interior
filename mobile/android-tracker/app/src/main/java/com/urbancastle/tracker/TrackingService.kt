package com.urbancastle.tracker

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.IBinder
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import kotlin.concurrent.thread

class TrackingService : Service() {
  private val client by lazy { LocationServices.getFusedLocationProviderClient(this) }
  private val storage by lazy { TrackerStorage(this) }
  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      val location = result.lastLocation ?: return
      if (location.accuracy <= 0 || location.accuracy > 250) return
      storage.enqueue(JSONObject()
        .put("latitude", location.latitude)
        .put("longitude", location.longitude)
        .put("accuracy_m", location.accuracy)
        .put("captured_at", java.time.Instant.ofEpochMilli(location.time).toString()))
      flush()
    }
  }
  override fun onCreate() {
    super.onCreate()
    val channel = NotificationChannel("tracking", "Location tracking", NotificationManager.IMPORTANCE_LOW)
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    startForeground(7, NotificationCompat.Builder(this, "tracking")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("Urban Castle location tracking")
      .setContentText("Background GPS is active for this registered device")
      .setOngoing(true).build())
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      stopSelf()
      return START_NOT_STICKY
    }
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 60_000)
      .setMinUpdateIntervalMillis(30_000)
      .setMaxUpdateDelayMillis(120_000)
      .build()
    client.requestLocationUpdates(request, callback, mainLooper)
    flush()
    return START_STICKY
  }
  private fun flush() {
    val token = storage.token ?: return
    val points = storage.queue()
    if (points.length() == 0) return
    thread { runCatching { TrackingApi.send(token, points) }.onSuccess { storage.clearQueue() } }
  }
  override fun onDestroy() {
    client.removeLocationUpdates(callback)
    super.onDestroy()
  }
  override fun onBind(intent: Intent?): IBinder? = null
}
