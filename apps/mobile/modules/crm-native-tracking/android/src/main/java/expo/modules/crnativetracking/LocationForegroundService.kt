package expo.modules.crnativetracking

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Native Android FGS — survives JS death.
 * Phase 4: persist ACTIVE shift; onStartCommand(null) re-reads DataStore and restarts FusedLocation.
 * Recovery chain: SERVICE_DEAD → RESTART_REQUESTED → TASK_RECREATED → ACCEPT_RECEIVED → RECOVERY_CONFIRMED
 */
class LocationForegroundService : Service() {
  companion object {
    const val EXTRA_SHIFT_ID = "shift_id"
    private const val CHANNEL_ID = "crm_field_tracking_native"
    private const val NOTIFICATION_ID = 61001
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private lateinit var fusedClient: FusedLocationProviderClient
  private lateinit var stateStore: TrackingStateStore
  private lateinit var database: TrackingDatabase
  private var activeShiftId: String? = null

  private val locationCallback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      val shiftId = activeShiftId ?: return
      for (location in result.locations) {
        scope.launch {
          captureSample(shiftId, location.latitude, location.longitude, location.accuracy.toDouble())
        }
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    fusedClient = LocationServices.getFusedLocationProviderClient(this)
    stateStore = TrackingStateStore(this)
    database = TrackingDatabase.get(this)
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Phase 4: null intent after OS kill — recover from persisted ACTIVE shift
    val shiftId = intent?.getStringExtra(EXTRA_SHIFT_ID) ?: stateStore.getActiveShiftBlocking()
    if (shiftId.isNullOrBlank()) {
      stopSelf()
      return START_NOT_STICKY
    }

    activeShiftId = shiftId
    stateStore.setActiveShiftBlocking(shiftId)
    stateStore.recordRecoveryEventBlocking("TASK_RECREATED")

    startForeground(NOTIFICATION_ID, buildNotification())
    startLocationUpdates()
    scope.launch {
      NativeSampleUploader(this@LocationForegroundService).flushPending()
    }

    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    fusedClient.removeLocationUpdates(locationCallback)
    super.onDestroy()
  }

  private fun startLocationUpdates() {
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 30_000L)
      .setMinUpdateIntervalMillis(15_000L)
      .setMaxUpdateDelayMillis(60_000L)
      .build()
    fusedClient.requestLocationUpdates(request, locationCallback, mainLooper)
  }

  /** B1 capture → B2 Room INSERT → async upload (B3 confirmed in NativeSampleUploader). */
  private suspend fun captureSample(
    shiftId: String,
    lat: Double,
    lng: Double,
    accuracyM: Double,
  ) {
    val sampleId = UUID.randomUUID().toString()
    val nowIso = TrackingHealthEvaluator.nowIso()
    stateStore.setLastGpsCapturedAtBlocking(nowIso)
    stateStore.setNativeLastSeenBlocking(nowIso)

    database.sampleDao().insert(
      TrackingSampleEntity(
        sampleId = sampleId,
        shiftId = shiftId,
        lat = lat,
        lng = lng,
        accuracyM = accuracyM,
        clientRecordedAt = nowIso,
        uploadState = "PENDING",
        attemptCount = 0,
        nextRetryAt = nowIso,
      ),
    )

    NativeSampleUploader(this).flushPending()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "CRM field tracking",
        NotificationManager.IMPORTANCE_LOW,
      )
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  private fun buildNotification(): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("CRM — зміна активна")
      .setContentText("Native GPS tracking")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .build()
  }
}
