package com.urbancastle.tracker

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class TrackerStorage(context: Context) {
  private val prefs = EncryptedSharedPreferences.create(
    context,
    "urban_castle_tracker",
    MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
  )
  var token: String?
    get() = prefs.getString("token", null)
    set(value) = prefs.edit().putString("token", value).apply()
  var staffName: String?
    get() = prefs.getString("staff_name", null)
    set(value) = prefs.edit().putString("staff_name", value).apply()
  val installationId: String
    get() {
      val current = prefs.getString("installation_id", null)
      if (current != null) return current
      return UUID.randomUUID().toString().also { prefs.edit().putString("installation_id", it).apply() }
    }
  @Synchronized fun enqueue(point: JSONObject) {
    val queue = queue()
    queue.put(point)
    val capped = JSONArray()
    val start = (queue.length() - 2880).coerceAtLeast(0)
    for (index in start until queue.length()) capped.put(queue.getJSONObject(index))
    prefs.edit().putString("queue", capped.toString()).apply()
  }
  @Synchronized fun queue(): JSONArray =
    runCatching { JSONArray(prefs.getString("queue", "[]")) }.getOrDefault(JSONArray())
  @Synchronized fun clearQueue() {
    prefs.edit().putString("queue", "[]").apply()
  }
}
