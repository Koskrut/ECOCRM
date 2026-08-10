package expo.modules.crnativetracking

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/** Phase 5 — WorkManager flush fallback when FGS inline upload fails or JS is dead. */
class TrackingFlushWorker(appContext: Context, params: androidx.work.WorkerParameters) :
  CoroutineWorker(appContext, params) {

  override suspend fun doWork(): Result {
    val uploaded = NativeSampleUploader(applicationContext).flushPending()
    return if (uploaded >= 0) Result.success() else Result.retry()
  }

  companion object {
    private const val UNIQUE = "crm_native_tracking_flush"

    fun schedule(context: Context, delaySec: Long = 30) {
      val req = OneTimeWorkRequestBuilder<TrackingFlushWorker>()
        .setInitialDelay(delaySec, TimeUnit.SECONDS)
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(
        UNIQUE,
        ExistingWorkPolicy.REPLACE,
        req,
      )
    }
  }
}
