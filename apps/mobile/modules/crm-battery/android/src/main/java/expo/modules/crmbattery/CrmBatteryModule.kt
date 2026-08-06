package expo.modules.crmbattery

import android.content.Context
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CrmBatteryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CrmBattery")

    AsyncFunction("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        return@AsyncFunction true
      }
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }
  }
}
