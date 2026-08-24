package expo.modules.crnativetracking

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlin.math.min
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Upload pending Room samples to POST /field/shifts/:id/samples WITHOUT JS.
 * B3 confirmed when response has created>0 or duplicate>0.
 * WorkManager [TrackingFlushWorker] is fallback when inline flush fails.
 *
 * Rejected batches (geo/accuracy/dedup) must leave Room — same as JS flush drops the batch
 * on HTTP 200 even when created=0, or uploads would retry the same poison forever.
 */
class NativeSampleUploader(private val context: Context) {
  companion object {
    private const val TAG = "CrmNativeTracking"
    private val flushMutex = Mutex()
  }

  private val db = TrackingDatabase.get(context)
  private val state = TrackingStateStore(context)

  suspend fun flushPending(reason: String = "watchdog"): Int {
    return flushMutex.withLock {
      val nowIso = TrackingHealthEvaluator.nowIso()
      val batch = db.sampleDao().pendingReady(nowIso)
      if (batch.isEmpty()) return@withLock 0
      val sampleIds = batch.map { it.sampleId }
      db.sampleDao().markInFlight(sampleIds)

      val grouped = batch.groupBy { it.shiftId }
      var uploaded = 0

      val deviceId = state.getDeviceId()
      val healthState =
        TrackingHealthEvaluator(context).evaluate()["trackingHealthState"] as? String
          ?: "TRACKING_HEALTHY"
      val snap = state.snapshot()
      val apiBase = snap["apiBaseUrl"]
      val token = snap["authToken"]
      if (apiBase.isNullOrBlank() || token.isNullOrBlank()) {
        Log.w(TAG, "flushPending skipped: missing auth/api credentials in DataStore")
        db.sampleDao().restorePending(sampleIds)
        TrackingFlushWorker.schedule(context)
        return@withLock 0
      }

      for ((shiftId, items) in grouped) {
      val batchId = UUID.randomUUID().toString()
      val payload = JSONObject().apply {
        put(
          "items",
          JSONArray().apply {
            for (sample in items) {
              val sampleSource = if (sample.attemptCount > 0) "retry_flush" else "replay_buffer"
              put(
                JSONObject().apply {
                  put("sampleId", sample.sampleId)
                  put("deviceId", deviceId)
                  put("lat", sample.lat)
                  put("lng", sample.lng)
                  put("accuracyM", sample.accuracyM)
                  put("clientRecordedAt", sample.clientRecordedAt)
                  put("source", "native_android")
                  put("sampleSource", sampleSource)
                  put("attempt", sample.attemptCount + 1)
                },
              )
            }
          },
        )
        put("batchId", batchId)
        put("reason", reason)
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
      val sampleIds = items.map { it.sampleId }
      val head = sampleIds.take(5).joinToString(",")
      val tail = if (sampleIds.size > 10) sampleIds.takeLast(5).joinToString(",") else ""
      Log.i(
        TAG,
        "flush batch=$batchId shift=$shiftId count=${items.size} reason=$reason head=$head" +
          if (tail.isNotBlank()) " tail=$tail" else "",
      )
      for (sample in items) {
        val sampleSource = if (sample.attemptCount > 0) "retry_flush" else "replay_buffer"
        Log.i(
          TAG,
          "sample sampleId=${sample.sampleId} shiftId=$shiftId deviceId=$deviceId " +
            "clientRecordedAt=${sample.clientRecordedAt} lat=${sample.lat} lng=${sample.lng} " +
            "accuracy=${sample.accuracyM} source=$sampleSource batchId=$batchId attempt=${sample.attemptCount + 1}",
        )
      }

      val result = postSamples(apiBase, token, shiftId, payload.toString())
        when {
          result.httpCode in 200..299 -> {
          dropBatch(items)
          uploaded += result.created + result.duplicate
          state.setLastFlushAt(nowIso)
          if (result.created > 0 || result.duplicate > 0) {
            state.setLastServerAcceptAt(nowIso)
            state.setNativeLastSeen(nowIso)
            state.recordRecoveryEvent("ACCEPT_RECEIVED")
            state.recordRecoveryEvent("RECOVERY_CONFIRMED")
          } else if (result.rejected > 0) {
            state.recordRejectReasons(result.rejectReasons)
            Log.i(
              TAG,
              "flush dropped rejected batch shift=$shiftId rejected=${result.rejected} reasons=${result.rejectReasons}",
            )
          }
        }
          result.discardBatch -> {
            dropBatch(items)
            state.setLastFlushAt(nowIso)
            Log.w(TAG, "flush discarded batch HTTP ${result.httpCode} shift=$shiftId")
          }
          result.retryable -> {
            val backoffMs = min(300_000L, 5_000L * (items.first().attemptCount + 1))
            val nextRetry = TrackingHealthEvaluator.futureIso(backoffMs)
            for (sample in items) {
              db.sampleDao().markRetry(sample.sampleId, nextRetry)
            }
            TrackingFlushWorker.schedule(context)
          }
          else -> {
            // 401/403 — keep batch until JS syncSession refreshes token
            db.sampleDao().restorePending(items.map { it.sampleId })
            Log.w(TAG, "flush blocked HTTP ${result.httpCode} shift=$shiftId (batch kept)")
            TrackingFlushWorker.schedule(context)
          }
        }
      }

      return@withLock uploaded
    }
  }

  private suspend fun dropBatch(items: List<TrackingSampleEntity>) {
    for (sample in items) {
      db.sampleDao().markUploaded(sample.sampleId)
    }
  }

  private data class UploadResult(
    val created: Int,
    val duplicate: Int,
    val rejected: Int,
    val rejectReasons: String?,
    val httpCode: Int,
  ) {
    val retryable: Boolean
      get() = httpCode >= 500 || httpCode == 408 || httpCode == 429 || httpCode <= 0

    val discardBatch: Boolean
      get() = httpCode == 400 || httpCode == 404
  }

  private fun postSamples(
    apiBase: String,
    token: String,
    shiftId: String,
    body: String,
  ): UploadResult {
    return try {
      val conn =
        (URL("$apiBase/field/shifts/$shiftId/samples").openConnection() as HttpURLConnection).apply {
          requestMethod = "POST"
          setRequestProperty("Content-Type", "application/json")
          setRequestProperty("Authorization", "Bearer $token")
          doOutput = true
          connectTimeout = 25_000
          readTimeout = 25_000
        }
      conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = conn.responseCode
      val text =
        (if (code in 200..299) conn.inputStream else conn.errorStream)
          ?.bufferedReader()?.readText() ?: ""
      if (code !in 200..299) {
        Log.w(TAG, "upload HTTP $code for shift=$shiftId")
        return UploadResult(0, 0, 0, null, code)
      }
      val json = JSONObject(text)
      val reasons = json.optJSONObject("rejectReasons")
      UploadResult(
        created = json.optInt("created", 0),
        duplicate = json.optInt("duplicate", 0),
        rejected = json.optInt("rejected", 0),
        rejectReasons = reasons?.toString(),
        httpCode = code,
      )
    } catch (e: Exception) {
      Log.w(TAG, "upload failed for shift=$shiftId: ${e.message}")
      UploadResult(0, 0, 0, null, 0)
    }
  }
}
