package expo.modules.crnativetracking

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.min

/**
 * Upload pending Room samples to POST /field/shifts/:id/samples WITHOUT JS.
 * B3 confirmed when response has created>0 or duplicate>0.
 * WorkManager [TrackingFlushWorker] is fallback when inline flush fails.
 */
class NativeSampleUploader(private val context: Context) {
  private val db = TrackingDatabase.get(context)
  private val state = TrackingStateStore(context)

  suspend fun flushPending(): Int {
    val nowIso = TrackingHealthEvaluator.nowIso()
    val batch = db.sampleDao().pendingReady(nowIso)
    if (batch.isEmpty()) return 0

    val grouped = batch.groupBy { it.shiftId }
    var uploaded = 0

    val deviceId = state.getDeviceIdBlocking()
    val healthState =
      TrackingHealthEvaluator(context).evaluate()["trackingHealthState"] as? String
        ?: "TRACKING_HEALTHY"
    val snap = state.snapshot()

    for ((shiftId, items) in grouped) {
      val payload = JSONObject().apply {
        put(
          "items",
          JSONArray().apply {
            for (sample in items) {
              put(
                JSONObject().apply {
                  put("sampleId", sample.sampleId)
                  put("deviceId", deviceId)
                  put("lat", sample.lat)
                  put("lng", sample.lng)
                  put("accuracyM", sample.accuracyM)
                  put("clientRecordedAt", sample.clientRecordedAt)
                  put("source", "native_android")
                },
              )
            }
          },
        )
        put(
          "telemetry",
          JSONObject().apply {
            put("nativeLastSeenAt", nowIso)
            put("lastGpsCapturedAt", snap["lastGpsCapturedAt"])
            put("trackingHealthState", healthState)
            put("deviceId", deviceId)
          },
        )
      }

      val result = postSamples(shiftId, payload.toString())
      if (result.created > 0 || result.duplicate > 0) {
        for (sample in items) {
          db.sampleDao().markUploaded(sample.sampleId)
        }
        uploaded += result.created + result.duplicate
        state.setLastServerAcceptAt(nowIso)
        state.recordRecoveryEvent("ACCEPT_RECEIVED")
        state.recordRecoveryEvent("RECOVERY_CONFIRMED")
      } else if (result.retryable) {
        val backoffMs = min(300_000L, 5_000L * (items.first().attemptCount + 1))
        val nextRetry = TrackingHealthEvaluator.futureIso(backoffMs)
        for (sample in items) {
          db.sampleDao().markRetry(sample.sampleId, nextRetry)
        }
        TrackingFlushWorker.schedule(context)
      }
    }

    return uploaded
  }

  private data class UploadResult(val created: Int, val duplicate: Int, val retryable: Boolean)

  private fun postSamples(shiftId: String, body: String): UploadResult {
    // Auth/api URL must be synced from JS via TrackingStateStore before native-only operation.
    val snap = kotlinx.coroutines.runBlocking { state.snapshot() }
    val apiBase = snap["apiBaseUrl"] ?: return UploadResult(0, 0, true)
    val token = snap["authToken"] ?: return UploadResult(0, 0, true)

    return try {
      val conn = (URL("$apiBase/field/shifts/$shiftId/samples").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Authorization", "Bearer $token")
        doOutput = true
        connectTimeout = 25_000
        readTimeout = 25_000
      }
      conn.outputStream.use { it.write(body.toByteArray()) }
      val code = conn.responseCode
      val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
        ?.bufferedReader()?.readText() ?: ""
      if (code !in 200..299) {
        return UploadResult(0, 0, code >= 500 || code == 408)
      }
      val json = JSONObject(text)
      UploadResult(
        created = json.optInt("created", 0),
        duplicate = json.optInt("duplicate", 0),
        retryable = false,
      )
    } catch (_: Exception) {
      UploadResult(0, 0, true)
    }
  }
}
