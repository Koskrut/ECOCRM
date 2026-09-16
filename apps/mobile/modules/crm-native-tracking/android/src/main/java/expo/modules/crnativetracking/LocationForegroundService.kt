package expo.modules.crnativetracking

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

/**
 * Native Android FGS — survives JS death / minimize.
 * Capture is filtered (mock / accuracy / UA bbox / dedup) before Room.
 * Upload is batched (5 points or 60s), not per sample.
 */
class LocationForegroundService : Service() {
  companion object {
    const val EXTRA_SHIFT_ID = "shift_id"
    private const val CHANNEL_ID = "crm_field_tracking_native"
    private const val NOTIFICATION_ID = 61001
    private const val TAG = "CrmNativeTracking"
    private const val TRACK_MAX_ACCURACY_M = 150.0
    private const val UA_LAT_MIN = 44.0
    private const val UA_LAT_MAX = 53.0
    private const val UA_LNG_MIN = 22.0
    private const val UA_LNG_MAX = 41.0
    private const val DEDUP_M = 15.0
    private const val KEEPALIVE_MS = 3 * 60_000L
    private const val FLUSH_COUNT = 5
    private const val FLUSH_DELAY_MS = 60_000L

    @Volatile
    var isForegroundRunning: Boolean = false
      private set

    fun markStopped() {
      isForegroundRunning = false
    }
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val captureMutex = Mutex()
  private lateinit var fusedClient: FusedLocationProviderClient
  private lateinit var stateStore: TrackingStateStore
  private lateinit var database: TrackingDatabase
  private var activeShiftId: String? = null
  private var locationUpdatesStarted = false
  private var lastAcceptedLat = Double.NaN
  private var lastAcceptedLng = Double.NaN
  private var lastAcceptedAtMs = 0L
  private var flushJob: Job? = null

  private val locationCallback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      val shiftId = activeShiftId ?: return
      val locations = result.locations.sortedBy { it.time }
      scope.launch {
        captureMutex.withLock {
          if (shouldStopForDayBoundary()) {
            Log.i(TAG, "day boundary — stopping FGS")
            stopSelf()
            return@withLock
          }
          for (location in locations) {
            captureSample(shiftId, location)
          }
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
    TrackingWatchdogWorker.schedulePeriodic(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
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
    stateStore.ensureShiftDateYmdBlocking()
    stateStore.recordRecoveryEventBlocking("TASK_RECREATED")

    promoteToForeground()
    isForegroundRunning = true
    startLocationUpdates()
    scope.launch {
      database.sampleDao().restoreInFlight()
      database.sampleDao().deleteUploadedOlderThan(TrackingHealthEvaluator.pastIso(7L * 24 * 60 * 60 * 1000))
      NativeSampleUploader(this@LocationForegroundService).flushPending("interval")
    }

    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onTaskRemoved(rootIntent: Intent?) {
    stateStore.recordRecoveryEventBlocking("TASK_REMOVED")
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    locationUpdatesStarted = false
    isForegroundRunning = false
    flushJob?.cancel()
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

  private suspend fun captureSample(shiftId: String, location: Location) {
    val reject = classifyLocation(location)
    if (reject != null) {
      stateStore.recordRejectReasons(JSONObject().put(reject, 1).toString())
      Log.i(TAG, "capture skipped reason=$reject acc=${location.accuracy} lat=${location.latitude} lng=${location.longitude}")
      return
    }

    val recordedAtMs = if (location.time > 0L) location.time else System.currentTimeMillis()
    val lat = location.latitude
    val lng = location.longitude
    if (shouldDedup(lat, lng, recordedAtMs)) {
      stateStore.recordRejectReasons(JSONObject().put("duplicate", 1).toString())
      return
    }

    val sampleId = UUID.randomUUID().toString()
    val recordedIso = Instant.ofEpochMilli(recordedAtMs).toString()
    val nowIso = TrackingHealthEvaluator.nowIso()
    stateStore.setLastGpsCapturedAtBlocking(nowIso)
    stateStore.setNativeLastSeenBlocking(nowIso)

    database.sampleDao().insert(
      TrackingSampleEntity(
        sampleId = sampleId,
        shiftId = shiftId,
        lat = lat,
        lng = lng,
        accuracyM = location.accuracy.toDouble(),
        clientRecordedAt = recordedIso,
        uploadState = "PENDING",
        attemptCount = 0,
        nextRetryAt = nowIso,
      ),
    )
    lastAcceptedLat = lat
    lastAcceptedLng = lng
    lastAcceptedAtMs = recordedAtMs

    val pending = database.sampleDao().pendingCount()
    if (pending >= FLUSH_COUNT) {
      flushJob?.cancel()
      NativeSampleUploader(this).flushPending("threshold")
    } else {
      scheduleFlush("interval")
    }
  }

  private fun scheduleFlush(reason: String) {
    flushJob?.cancel()
    flushJob = scope.launch {
      delay(FLUSH_DELAY_MS)
      NativeSampleUploader(this@LocationForegroundService).flushPending(reason)
    }
  }

  private fun classifyLocation(location: Location): String? {
    if (isMockLocation(location)) return "mock"
    if (location.accuracy > TRACK_MAX_ACCURACY_M) return "bad_accuracy"
    val lat = location.latitude
    val lng = location.longitude
    if (lat < UA_LAT_MIN || lat > UA_LAT_MAX || lng < UA_LNG_MIN || lng > UA_LNG_MAX) {
      return "out_of_region"
    }
    return null
  }

  private fun isMockLocation(location: Location): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      location.isMock
    } else {
      @Suppress("DEPRECATION")
      location.isFromMockProvider
    }
  }

  private fun shouldDedup(lat: Double, lng: Double, atMs: Long): Boolean {
    if (lastAcceptedAtMs <= 0L || lastAcceptedLat.isNaN()) return false
    val dist = haversineM(lastAcceptedLat, lastAcceptedLng, lat, lng)
    if (dist >= DEDUP_M) return false
    return atMs - lastAcceptedAtMs < KEEPALIVE_MS
  }

  private fun haversineM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
    val r = 6371000.0
    val dLat = Math.toRadians(lat2 - lat1)
    val dLng = Math.toRadians(lng2 - lng1)
    val a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2)
    return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  private fun shouldStopForDayBoundary(): Boolean {
    val shiftDate = stateStore.getShiftDateYmdBlocking() ?: return false
    val kyiv = ZoneId.of("Europe/Kyiv")
    val now = java.time.ZonedDateTime.now(kyiv)
    if (now.toLocalDate().toString() != shiftDate) return true
    return now.toLocalTime() >= LocalTime.of(23, 59)
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
