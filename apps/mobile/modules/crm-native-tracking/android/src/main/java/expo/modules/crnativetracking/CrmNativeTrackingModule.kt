package expo.modules.crnativetracking

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.runBlocking

/**
 * RN bridge for native field tracking.
 * GPS capture + upload happen in [LocationForegroundService] — not here.
 *
 * B1/B2/B3 semantics (supervisor must not infer GPS from service existence alone):
 * - B1 lastGpsCapturedAt — FusedLocationProvider delivered a fix (local)
 * - B2 Room row persisted before upload attempt (local-first)
 * - B3 lastServerAcceptAt — POST /field/shifts/:id/samples returned created>0 or duplicate
 */
class CrmNativeTrackingModule : Module() {
  companion object {
    private const val TAG = "CrmNativeTracking"
  }

  override fun definition() = ModuleDefinition {
    Name("CrmNativeTracking")

    AsyncFunction("isNativeTrackingAvailable") {
      true
    }

    AsyncFunction("syncSession") { authToken: String, apiBaseUrl: String ->
      val context = resolveAppContext() ?: run {
        Log.w(TAG, "syncSession: no Android context")
        return@AsyncFunction false
      }
      if (authToken.isBlank() || apiBaseUrl.isBlank()) {
        Log.w(TAG, "syncSession: blank token or apiBaseUrl")
        return@AsyncFunction false
      }
      runBlocking {
        val store = TrackingStateStore(context)
        store.setSessionCredentials(authToken, apiBaseUrl)
        // Seed stable deviceId before FGS uploads.
        store.getDeviceId()
      }
      true
    }

    AsyncFunction("clearSession") {
      val context = resolveAppContext() ?: return@AsyncFunction false
      runBlocking {
        TrackingStateStore(context).clearSessionCredentials()
      }
      true
    }

    AsyncFunction("startTracking") { shiftId: String ->
      val context = resolveAppContext() ?: run {
        Log.w(TAG, "startTracking: no Android context")
        return@AsyncFunction false
      }
      if (shiftId.isBlank()) return@AsyncFunction false
      runBlocking {
        val store = TrackingStateStore(context)
        val db = TrackingDatabase.get(context)
        store.getDeviceId()
        val shiftChanged = store.prepareActiveShift(shiftId)
        if (shiftChanged) {
          db.sampleDao().deleteAllPending()
        }
        store.clearLastRejectReasons()
        store.recordRecoveryEvent("RESTART_REQUESTED")
      }
      startForegroundService(context, shiftId)
      true
    }

    AsyncFunction("stopTracking") {
      val context = resolveAppContext() ?: return@AsyncFunction false
      context.stopService(Intent(context, LocationForegroundService::class.java))
      runBlocking {
        TrackingStateStore(context).clearActiveShift()
      }
      LocationForegroundService.markStopped()
      true
    }

    AsyncFunction("getTrackingHealth") {
      val context = resolveAppContext() ?: return@AsyncFunction emptyMap<String, Any?>()
      runBlocking {
        TrackingHealthEvaluator(context).evaluate()
      }
    }

    AsyncFunction("flushPendingSamples") {
      val context = resolveAppContext() ?: return@AsyncFunction 0
      runBlocking {
        NativeSampleUploader(context).flushPending()
      }
    }

    AsyncFunction("purgePendingSamples") {
      val context = resolveAppContext() ?: return@AsyncFunction 0
      runBlocking {
        TrackingDatabase.get(context).sampleDao().deleteAllPending()
      }
    }
  }

  /**
   * reactContext can be briefly null during bridge races; fall back to activity
   * applicationContext so syncSession/startTracking do not fail while AppState=active.
   */
  private fun resolveAppContext(): Context? {
    val react = appContext.reactContext
    if (react != null) return react.applicationContext
    val activity = appContext.currentActivity
    if (activity != null) return activity.applicationContext
    Log.w(TAG, "resolveAppContext: reactContext and currentActivity both null")
    return null
  }

  private fun startForegroundService(context: Context, shiftId: String) {
    val intent = Intent(context, LocationForegroundService::class.java).apply {
      putExtra(LocationForegroundService.EXTRA_SHIFT_ID, shiftId)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }
}
