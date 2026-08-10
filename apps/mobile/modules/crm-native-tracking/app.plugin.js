const {
  withSettingsGradle,
  withAndroidManifest,
  AndroidConfig,
} = require("@expo/config-plugins");

const KSP_VERSION = "2.1.20-2.0.1";

const PERMISSIONS = [
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_LOCATION",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.WAKE_LOCK",
  "android.permission.RECEIVE_BOOT_COMPLETED",
];

/** Ensures KSP is resolvable for Room during EAS / expo prebuild. */
function withKspSettings(config) {
  return withSettingsGradle(config, (gradleConfig) => {
    let contents = gradleConfig.modResults.contents;
    const marker = "com.google.devtools.ksp";
    if (!contents.includes(marker)) {
      contents = contents.replace(
        /pluginManagement\s*\{/,
        `pluginManagement {
  plugins {
    id("${marker}") version "${KSP_VERSION}"
  }`,
      );
    }
    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
}

/** Ensure FGS location permissions survive manifest merges (service lives in module AndroidManifest). */
function withNativeTrackingManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    for (const permission of PERMISSIONS) {
      AndroidConfig.Permissions.ensurePermission(manifest, permission);
    }
    return mod;
  });
}

module.exports = function withCrmNativeTracking(config) {
  config = withKspSettings(config);
  config = withNativeTrackingManifest(config);
  return config;
};
