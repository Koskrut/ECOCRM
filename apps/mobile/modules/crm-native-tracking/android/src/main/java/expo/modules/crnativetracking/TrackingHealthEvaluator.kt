package expo.modules.crnativetracking

import android.content.Context
import java.time.Instant

/** Evaluates native pipeline health for getTrackingHealth() — no proof from service existence alone. */
class TrackingHealthEvaluator(private val context: Context) {
  private val state = TrackingStateStore(context)
  private val db = TrackingDatabase.get(context)

  suspend fun evaluate(): Map<String, Any?> {
    val snap = state.snapshot()
    val pending = db.sampleDao().pendingCount()
    val now = Instant.now()
    val lastGps = parseIso(snap["lastGpsCapturedAt"])
    val lastAccept = parseIso(snap["lastServerAcceptAt"])
    val nativeSeen = parseIso(snap["nativeLastSeenAt"])

    val health = when {
      snap["recoveryState"] == "RECOVERY_FAILED" -> "RECOVERY_FAILED"
      snap["recoveryState"] == "RECOVERY_IN_PROGRESS" -> "RECOVERY_IN_PROGRESS"
      nativeSeen != null && now.epochSecond - nativeSeen.epochSecond > 600 -> "SERVICE_DEAD"
      lastAccept != null && now.epochSecond - lastAccept.epochSecond > 600 -> "LOCATION_STALE"
      lastGps != null && lastAccept != null && lastGps.epochSecond > lastAccept.epochSecond + 300 ->
        "NETWORK_DEGRADED"
      pending > 20 -> "NETWORK_DEGRADED"
      else -> "TRACKING_HEALTHY"
    }

    val serviceRunning =
      LocationForegroundService.isForegroundRunning || !snap["activeShiftId"].isNullOrBlank()

    return mapOf(
      "trackingHealthState" to health,
      "lastGpsCapturedAt" to snap["lastGpsCapturedAt"],
      "lastServerAcceptAt" to snap["lastServerAcceptAt"],
      "nativeLastSeenAt" to snap["nativeLastSeenAt"],
      "pendingUploadCount" to pending,
      "serviceRunning" to serviceRunning,
      "activeShiftId" to snap["activeShiftId"],
      "recoveryState" to snap["recoveryState"],
    )
  }

  companion object {
    fun nowIso(): String = Instant.now().toString()

    fun futureIso(delayMs: Long): String = Instant.now().plusMillis(delayMs).toString()

    private fun parseIso(value: String?): Instant? {
      if (value.isNullOrBlank()) return null
      return try {
        Instant.parse(value)
      } catch (_: Exception) {
        null
      }
    }
  }
}
