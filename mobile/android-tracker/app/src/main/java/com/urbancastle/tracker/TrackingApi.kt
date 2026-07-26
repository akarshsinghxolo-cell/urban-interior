package com.urbancastle.tracker

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object TrackingApi {
  private const val BASE_URL = "https://urban-castle.vercel.app"
  private fun post(path: String, body: JSONObject, token: String? = null): JSONObject {
    val connection = (URL(BASE_URL + path).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 20_000
      readTimeout = 20_000
      doOutput = true
      setRequestProperty("Content-Type", "application/json")
      if (token != null) setRequestProperty("Authorization", "Bearer $token")
    }
    connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
    val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
    val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
    if (connection.responseCode !in 200..299) {
      val message = runCatching { JSONObject(payload).optString("error") }.getOrNull()
      throw IllegalStateException(message?.ifBlank { null } ?: "Server returned ${connection.responseCode}")
    }
    return JSONObject(payload)
  }
  fun enroll(code: String, deviceName: String, installationId: String): JSONObject =
    post("/api/tracking/devices/register", JSONObject()
      .put("code", code).put("deviceName", deviceName)
      .put("platform", "android").put("installationId", installationId))
  fun send(token: String, points: JSONArray): JSONObject =
    post("/api/tracking/devices/pings", JSONObject().put("points", points), token)
}
