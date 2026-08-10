package expo.modules.crmbattery

import android.Manifest
import android.content.Context
import android.os.Build
import android.os.PowerManager
import androidx.core.content.PermissionChecker
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CrmBatteryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CrmBattery")

    AsyncFunction("isIgnoringBatteryOptimizations") {
      val context = resolveAppContext() ?: return@AsyncFunction null
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        return@AsyncFunction true
      }
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * Source-of-truth check for Android "Allow all the time".
     * null when React context is not ready — never treat as denied.
     */
    AsyncFunction("hasBackgroundLocationPermission") {
      val context = resolveAppContext() ?: return@AsyncFunction null
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        // Pre-Q: fine/coarse imply background access.
        return@AsyncFunction hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ||
          hasPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
      }
      hasPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    }

    AsyncFunction("hasFineLocationPermission") {
      val context = resolveAppContext() ?: return@AsyncFunction null
      hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ||
        hasPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    }
  }

  private fun resolveAppContext(): Context? {
    val react = appContext.reactContext
    if (react != null) return react.applicationContext
    val activity = appContext.currentActivity
    if (activity != null) return activity.applicationContext
    return null
  }

  private fun hasPermission(context: Context, permission: String): Boolean {
    return PermissionChecker.checkSelfPermission(context, permission) ==
      PermissionChecker.PERMISSION_GRANTED
  }
}
