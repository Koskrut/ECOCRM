package expo.modules.crnativetracking

import android.content.Context
import android.provider.Settings
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import java.util.UUID

private val Context.trackingDataStore by preferencesDataStore("crm_native_tracking_state")

/** Persist ACTIVE shift + telemetry timestamps across service restarts. */
class TrackingStateStore(private val context: Context) {
  companion object {
    private val KEY_SHIFT = stringPreferencesKey("active_shift_id")
    private val KEY_LAST_GPS = stringPreferencesKey("last_gps_captured_at")
    private val KEY_LAST_ACCEPT = stringPreferencesKey("last_server_accept_at")
    private val KEY_NATIVE_SEEN = stringPreferencesKey("native_last_seen_at")
    private val KEY_RECOVERY = stringPreferencesKey("recovery_state")
    private val KEY_AUTH = stringPreferencesKey("auth_token")
    private val KEY_API = stringPreferencesKey("api_base_url")
    private val KEY_BACKOFF = longPreferencesKey("upload_backoff_ms")
    private val KEY_DEVICE_ID = stringPreferencesKey("device_id")
    private val KEY_LAST_FLUSH = stringPreferencesKey("last_flush_at")
    private val KEY_LAST_REJECT = stringPreferencesKey("last_reject_reasons")
  }

  /** Stable install id for sample idempotency / backend deviceId field. */
  suspend fun getDeviceId(): String {
    val prefs = context.trackingDataStore.data.first()
    val existing = prefs[KEY_DEVICE_ID]
    if (!existing.isNullOrBlank()) return existing
    val androidId =
      Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
    val id =
      if (!androidId.isNullOrBlank()) androidId else UUID.randomUUID().toString()
    context.trackingDataStore.edit { it[KEY_DEVICE_ID] = id }
    return id
  }

  fun getDeviceIdBlocking(): String = runBlocking { getDeviceId() }

  suspend fun setActiveShift(shiftId: String) {
    context.trackingDataStore.edit { it[KEY_SHIFT] = shiftId }
  }

  fun setActiveShiftBlocking(shiftId: String) = runBlocking { setActiveShift(shiftId) }

  suspend fun clearActiveShift() {
    context.trackingDataStore.edit { it.remove(KEY_SHIFT) }
  }

  fun getActiveShiftBlocking(): String? = runBlocking {
    context.trackingDataStore.data.first()[KEY_SHIFT]
  }

  suspend fun setLastGpsCapturedAt(iso: String) {
    context.trackingDataStore.edit { it[KEY_LAST_GPS] = iso }
  }

  fun setLastGpsCapturedAtBlocking(iso: String) = runBlocking { setLastGpsCapturedAt(iso) }

  suspend fun setLastServerAcceptAt(iso: String) {
    context.trackingDataStore.edit { it[KEY_LAST_ACCEPT] = iso }
  }

  suspend fun setLastFlushAt(iso: String) {
    context.trackingDataStore.edit { it[KEY_LAST_FLUSH] = iso }
  }

  suspend fun recordRejectReasons(json: String?) {
    if (json.isNullOrBlank()) return
    context.trackingDataStore.edit { it[KEY_LAST_REJECT] = json }
  }

  suspend fun clearLastRejectReasons() {
    context.trackingDataStore.edit { it.remove(KEY_LAST_REJECT) }
  }

  fun clearLastRejectReasonsBlocking() = runBlocking { clearLastRejectReasons() }

  suspend fun setNativeLastSeen(iso: String) {
    context.trackingDataStore.edit { it[KEY_NATIVE_SEEN] = iso }
  }

  fun setNativeLastSeenBlocking(iso: String) = runBlocking { setNativeLastSeen(iso) }

  suspend fun recordRecoveryEvent(event: String) {
    context.trackingDataStore.edit { it[KEY_RECOVERY] = event }
  }

  fun recordRecoveryEventBlocking(event: String) = runBlocking { recordRecoveryEvent(event) }

  suspend fun setSessionCredentials(authToken: String, apiBaseUrl: String) {
    context.trackingDataStore.edit {
      it[KEY_AUTH] = authToken
      it[KEY_API] = apiBaseUrl.trimEnd('/')
    }
  }

  suspend fun clearSessionCredentials() {
    context.trackingDataStore.edit {
      it.remove(KEY_AUTH)
      it.remove(KEY_API)
    }
  }

  suspend fun snapshot(): Map<String, String?> {
    val prefs = context.trackingDataStore.data.first()
    return mapOf(
      "activeShiftId" to prefs[KEY_SHIFT],
      "lastGpsCapturedAt" to prefs[KEY_LAST_GPS],
      "lastServerAcceptAt" to prefs[KEY_LAST_ACCEPT],
      "lastFlushAt" to prefs[KEY_LAST_FLUSH],
      "lastRejectReasons" to prefs[KEY_LAST_REJECT],
      "nativeLastSeenAt" to prefs[KEY_NATIVE_SEEN],
      "recoveryState" to prefs[KEY_RECOVERY],
      "authToken" to prefs[KEY_AUTH],
      "apiBaseUrl" to prefs[KEY_API],
    )
  }
}
