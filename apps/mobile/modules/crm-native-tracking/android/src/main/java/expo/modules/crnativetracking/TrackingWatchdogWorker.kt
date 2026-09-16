package expo.modules.crnativetracking

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.time.LocalTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/**
 * Periodic FGS liveness check. If the service died, posts a high-priority
 * notification (tap opens the app so FGS start is allowed). Also reminds
 * to close the shift around 20:00 Kyiv.
 */
class TrackingWatchdogWorker(appContext: Context, params: androidx.work.WorkerParameters) :
  CoroutineWorker(appContext, params) {

  override suspend fun doWork(): Result {
    val store = TrackingStateStore(applicationContext)
    val shiftId = store.getActiveShiftBlocking()
    if (shiftId.isNullOrBlank()) return Result.success()

    val kyiv = ZoneId.of("Europe/Kyiv")
    val now = java.time.ZonedDateTime.now(kyiv)
    val shiftDate = store.getShiftDateYmdBlocking()
    if (shiftDate != null && now.toLocalDate().toString() != shiftDate) {
      applicationContext.stopService(Intent(applicationContext, LocationForegroundService::class.java))
      store.clearActiveShift()
      LocationForegroundService.markStopped()
      return Result.success()
    }

    if (!LocationForegroundService.isForegroundRunning) {
      notifyGpsStopped(applicationContext)
    }

    val t = now.toLocalTime()
    if (t.hour == 20 && t.minute < 20) {
      notifyCloseShift(applicationContext)
    }

    NativeSampleUploader(applicationContext).flushPending("watchdog")
    return Result.success()
  }

  companion object {
    private const val UNIQUE = "crm_native_tracking_watchdog"
    private const val ALERT_CHANNEL = "crm_field_tracking_alert"
    private const val GPS_STOPPED_ID = 61002
    private const val CLOSE_SHIFT_ID = 61003

    fun schedulePeriodic(context: Context) {
      val req =
        PeriodicWorkRequestBuilder<TrackingWatchdogWorker>(15, TimeUnit.MINUTES)
          .setConstraints(Constraints.Builder().build())
          .build()
      WorkManager.getInstance(context).enqueueUniquePeriodicWork(
        UNIQUE,
        ExistingPeriodicWorkPolicy.KEEP,
        req,
      )
    }

    fun notifyGpsStopped(context: Context) {
      ensureAlertChannel(context)
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
      val pi =
        PendingIntent.getActivity(
          context,
          1,
          launch,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      val n =
        NotificationCompat.Builder(context, ALERT_CHANNEL)
          .setContentTitle("GPS зупинився")
          .setContentText("Натисніть, щоб відновити трекінг зміни")
          .setSmallIcon(android.R.drawable.ic_dialog_alert)
          .setPriority(NotificationCompat.PRIORITY_HIGH)
          .setAutoCancel(true)
          .setContentIntent(pi)
          .build()
      context.getSystemService(NotificationManager::class.java).notify(GPS_STOPPED_ID, n)
    }

    private fun notifyCloseShift(context: Context) {
      ensureAlertChannel(context)
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
      val pi =
        PendingIntent.getActivity(
          context,
          2,
          launch,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      val n =
        NotificationCompat.Builder(context, ALERT_CHANNEL)
          .setContentTitle("Закрийте зміну")
          .setContentText("Нагадування: завершіть зміну до 23:59")
          .setSmallIcon(android.R.drawable.ic_menu_recent_history)
          .setPriority(NotificationCompat.PRIORITY_DEFAULT)
          .setAutoCancel(true)
          .setContentIntent(pi)
          .build()
      context.getSystemService(NotificationManager::class.java).notify(CLOSE_SHIFT_ID, n)
    }

    private fun ensureAlertChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val channel =
        NotificationChannel(
          ALERT_CHANNEL,
          "CRM GPS alerts",
          NotificationManager.IMPORTANCE_HIGH,
        )
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }
}
