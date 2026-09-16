package expo.modules.crnativetracking

import android.content.Context
import android.os.Build
import android.os.PowerManager
import org.json.JSONObject

object DeviceTelemetry {
  fun addTo(context: Context, json: JSONObject) {
    try {
      val info = context.packageManager.getPackageInfo(context.packageName, 0)
      json.put("appVersion", info.versionName ?: "")
      val code =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          info.longVersionCode.toString()
        } else {
          @Suppress("DEPRECATION")
          info.versionCode.toString()
        }
      json.put("appVersionCode", code)
    } catch (_: Exception) {
      /* ignore */
    }
    json.put("manufacturer", Build.MANUFACTURER ?: "")
    json.put("trackingSource", "native_android")
    try {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      json.put("ignoringBatteryOptimizations", pm.isIgnoringBatteryOptimizations(context.packageName))
    } catch (_: Exception) {
      /* ignore */
    }
  }
}
