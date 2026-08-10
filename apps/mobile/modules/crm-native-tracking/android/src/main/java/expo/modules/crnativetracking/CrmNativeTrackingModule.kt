package expo.modules.crnativetracking

import android.content.Context
import android.content.Intent
import android.os.Build
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
  override fun definition() = ModuleDefinition {
    Name("CrmNativeTracking")

    AsyncFunction("isNativeTrackingAvailable") {
      true
    }

    AsyncFunction("syncSession") { authToken: String, apiBaseUrl: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      runBlocking {
        TrackingStateStore(context).setSessionCredentials(authToken, apiBaseUrl)
      }
      true
    }

    AsyncFunction("clearSession") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      runBlocking {
        TrackingStateStore(context).clearSessionCredentials()
      }
      true
    }

    AsyncFunction("startTracking") { shiftId: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      TrackingStateStore(context).setActiveShift(shiftId)
      startForegroundService(context, shiftId)
      true
    }

    AsyncFunction("stopTracking") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      context.stopService(Intent(context, LocationForegroundService::class.java))
      TrackingStateStore(context).clearActiveShift()
      true
    }

    AsyncFunction("getTrackingHealth") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyMap<String, Any?>()
      runBlocking {
        TrackingHealthEvaluator(context).evaluate()
      }
    }

    AsyncFunction("flushPendingSamples") {
      val context = appContext.reactContext ?: return@AsyncFunction 0
      runBlocking {
        NativeSampleUploader(context).flushPending()
      }
    }
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
