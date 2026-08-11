package expo.modules.crnativetracking

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.util.UUID

/**
 * Native Android FGS — survives JS death / minimize.
 * Phase 4: persist ACTIVE shift; onStartCommand(null) re-reads DataStore and restarts FusedLocation.
 * Recovery chain: SERVICE_DEAD → RESTART_REQUESTED → TASK_RECREATED → ACCEPT_RECEIVED → RECOVERY_CONFIRMED
 */
class LocationForegroundService : Service() {
  companion object {
    const val EXTRA_SHIFT_ID = "shift_id"
    private const val CHANNEL_ID = "crm_field_tracking_native"
    private const val NOTIFICATION_ID = 61001
    private const val TAG = "CrmNativeTracking"

    /** True while FGS is alive — used by getTrackingHealth (not DataStore alone). */
    @Volatile
    var isForegroundRunning: Boolean = false
      private set

    fun markStopped() {
      isForegroundRunning = false
    }
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private lateinit var fusedClient: FusedLocationProviderClient
  private lateinit var stateStore: TrackingStateStore
  private lateinit var database: TrackingDatabase
  private var activeShiftId: String? = null
  private var locationUpdatesStarted = false

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
    val shiftChanged = stateStore.prepareActiveShiftBlocking(shiftId)
    if (shiftChanged) {
      runBlocking { database.sampleDao().deleteAllPending() }
    }
    stateStore.recordRecoveryEventBlocking("TASK_RECREATED")

    promoteToForeground()
    isForegroundRunning = true
    startLocationUpdates()
    scope.launch {
      NativeSampleUploader(this@LocationForegroundService).flushPending()
    }

    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Keep FGS alive when user swipes CRM from recents (Test B / OEM minimize).
    stateStore.recordRecoveryEventBlocking("TASK_REMOVED")
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    locationUpdatesStarted = false
    isForegroundRunning = false
    try {
      fusedClient.removeLocationUpdates(locationCallback)
    } catch (_: Exception) {
      /* already removed */
    }
    stateStore.recordRecoveryEventBlocking("SERVICE_DEAD")
    scope.cancel()
    super.onDestroy()
  }

  private fun promoteToForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun startLocationUpdates() {
    if (locationUpdatesStarted) return
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 30_000L)
      .setMinUpdateIntervalMillis(15_000L)
      .setMaxUpdateDelayMillis(60_000L)
      .setWaitForAccurateLocation(false)
      .build()
    try {
      fusedClient.requestLocationUpdates(request, locationCallback, mainLooper)
      locationUpdatesStarted = true
    } catch (e: SecurityException) {
      Log.e(TAG, "Missing location permission for FusedLocation", e)
      stateStore.recordRecoveryEventBlocking("RECOVERY_FAILED")
      stopSelf()
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start location updates", e)
      stateStore.recordRecoveryEventBlocking("RECOVERY_FAILED")
    }
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
    // B1 — GPS fix delivered by FusedLocationProvider
    stateStore.setLastGpsCapturedAtBlocking(nowIso)
    stateStore.setNativeLastSeenBlocking(nowIso)

    // B2 — persist before network
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
      ).apply {
        description = "Native GPS during active field shift"
        setShowBadge(false)
        enableVibration(false)
      }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent =
      if (launchIntent != null) {
        PendingIntent.getActivity(
          this,
          0,
          launchIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      } else {
        null
      }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("CRM — зміна активна")
      .setContentText("Native GPS tracking")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .apply { if (contentIntent != null) setContentIntent(contentIntent) }
      .build()
  }
}
