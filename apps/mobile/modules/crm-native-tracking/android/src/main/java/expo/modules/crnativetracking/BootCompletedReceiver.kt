package expo.modules.crnativetracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/** Start FGS after reboot / app update when an ACTIVE shift is persisted. */
class BootCompletedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (
      action != Intent.ACTION_BOOT_COMPLETED &&
      action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
      action != Intent.ACTION_MY_PACKAGE_REPLACED
    ) {
      return
    }
    val app = context.applicationContext
    val pending = goAsync()
    Thread {
      try {
        val store = TrackingStateStore(app)
        val shiftId = store.getActiveShiftBlocking()
        TrackingWatchdogWorker.schedulePeriodic(app)
        if (shiftId.isNullOrBlank()) return@Thread
        val launch = Intent(app, LocationForegroundService::class.java).apply {
          putExtra(LocationForegroundService.EXTRA_SHIFT_ID, shiftId)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          app.startForegroundService(launch)
        } else {
          app.startService(launch)
        }
        Log.i("CrmNativeTracking", "BootCompletedReceiver started FGS shift=$shiftId")
      } catch (e: Exception) {
        Log.w("CrmNativeTracking", "BootCompletedReceiver failed: ${e.message}")
        TrackingWatchdogWorker.notifyGpsStopped(app)
      } finally {
        pending.finish()
      }
    }.start()
  }
}
