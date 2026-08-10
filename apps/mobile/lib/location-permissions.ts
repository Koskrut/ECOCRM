import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as IntentLauncher from "expo-intent-launcher";
import * as Location from "expo-location";
import { Alert, Linking, Platform } from "react-native";

import {
  hasBackgroundLocationPermission,
  hasFineLocationPermission,
} from "../modules/crm-battery";
import { buildBatteryOptimizationPackageUri } from "./battery-intent";
import { t } from "./i18n";
import {
  isBackgroundLocationGrantedStatus,
  resolveBackgroundPermissionStatus,
  shouldShowBackgroundRequiredDialog,
  shouldSkipBackgroundPermissionPrompt,
} from "./location-permissions-core";

export { buildBatteryOptimizationPackageUri } from "./battery-intent";
export {
  isBackgroundLocationGrantedStatus,
  resolveBackgroundPermissionStatus,
  shouldShowBackgroundRequiredDialog,
  shouldSkipBackgroundPermissionPrompt,
} from "./location-permissions-core";

export type TrackingPermissionStatus = {
  foreground: Location.PermissionStatus;
  background: Location.PermissionStatus | null;
  /** Whether the OS still allows prompting for background ("Allow all the time"). */
  backgroundCanAskAgain: boolean;
};

const BATTERY_PROMPT_KEY = "field_battery_opt_prompted";

const ANDROID_PACKAGE =
  Constants.expoConfig?.android?.package ?? "dental.suprex.crm.manager";

async function readNativeBackgroundGranted(): Promise<boolean | null> {
  if (Platform.OS !== "android") return null;
  return hasBackgroundLocationPermission();
}

async function readNativeForegroundGranted(): Promise<boolean | null> {
  if (Platform.OS !== "android") return null;
  return hasFineLocationPermission();
}

function asPermissionStatus(value: string | null): Location.PermissionStatus | null {
  if (value == null) return null;
  if (value === "granted") return Location.PermissionStatus.GRANTED;
  if (value === "denied") return Location.PermissionStatus.DENIED;
  if (value === "undetermined") return Location.PermissionStatus.UNDETERMINED;
  return value as Location.PermissionStatus;
}

/** Read current permission status without showing any system dialog. */
export async function getTrackingPermissionStatus(): Promise<TrackingPermissionStatus> {
  let fgStatus: Location.PermissionStatus = Location.PermissionStatus.UNDETERMINED;
  let fgCanAskAgain = true;
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    fgStatus = fg.status;
    fgCanAskAgain = fg.canAskAgain;
  } catch {
    fgStatus = Location.PermissionStatus.UNDETERMINED;
  }

  const nativeFg = await readNativeForegroundGranted();
  if (fgStatus !== "granted" && nativeFg === true) {
    fgStatus = Location.PermissionStatus.GRANTED;
  }

  let background: Location.PermissionStatus | null = null;
  let backgroundCanAskAgain = false;
  if (fgStatus === "granted") {
    let expoBg: string = Location.PermissionStatus.UNDETERMINED;
    let canAskAgain = true;
    try {
      const bg = await Location.getBackgroundPermissionsAsync();
      expoBg = bg.status;
      canAskAgain = bg.canAskAgain;
    } catch {
      expoBg = Location.PermissionStatus.UNDETERMINED;
      canAskAgain = true;
    }
    const nativeBg = await readNativeBackgroundGranted();
    background = asPermissionStatus(resolveBackgroundPermissionStatus(expoBg, nativeBg));
    backgroundCanAskAgain = canAskAgain;
  }
  return { foreground: fgStatus, background, backgroundCanAskAgain };
}

/**
 * Re-probe background permission on Android when expo/native read is a false-negative.
 * If the user already chose «Allow all the time» in Settings, requestBackgroundPermissionsAsync
 * returns granted without showing another dialog.
 */
export async function ensureBackgroundLocationGranted(): Promise<TrackingPermissionStatus> {
  let status = await getTrackingPermissionStatus();
  if (status.foreground !== "granted") return status;
  if (isBackgroundLocationGrantedStatus(status.background)) return status;

  if (Platform.OS !== "android") return status;

  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    const nativeBg = await readNativeBackgroundGranted();
    status = {
      foreground: status.foreground,
      background: asPermissionStatus(resolveBackgroundPermissionStatus(bg.status, nativeBg)),
      backgroundCanAskAgain: bg.canAskAgain,
    };
  } catch {
    /* keep prior status */
  }
  return status;
}

function showBackgroundRationale(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(t("gps.backgroundRationaleTitle"), t("gps.backgroundRationale"), [
      { text: t("common.later"), style: "cancel", onPress: () => resolve(false) },
      { text: t("gps.backgroundRationaleContinue"), onPress: () => resolve(true) },
    ]);
  });
}

/** Request foreground then background permission, reporting whether we may still ask. */
export async function requestTrackingPermissions(): Promise<TrackingPermissionStatus> {
  const fg = await Location.requestForegroundPermissionsAsync();
  let foreground = fg.status;
  const nativeFg = await readNativeForegroundGranted();
  if (foreground !== "granted" && nativeFg === true) {
    foreground = Location.PermissionStatus.GRANTED;
  }
  if (foreground !== "granted") {
    return {
      foreground,
      background: null,
      backgroundCanAskAgain: fg.canAskAgain,
    };
  }

  const bg = await Location.requestBackgroundPermissionsAsync();
  const nativeBg = await readNativeBackgroundGranted();
  const background = asPermissionStatus(
    resolveBackgroundPermissionStatus(bg.status, nativeBg),
  );
  return {
    foreground,
    background,
    backgroundCanAskAgain: bg.canAskAgain,
  };
}

/**
 * Request permissions with a short rationale before the background system dialog.
 * Use when starting a shift so users understand why «Always» is needed.
 */
export async function requestTrackingPermissionsWithRationale(): Promise<TrackingPermissionStatus> {
  const fg = await Location.requestForegroundPermissionsAsync();
  let foreground = fg.status;
  const nativeFg = await readNativeForegroundGranted();
  if (foreground !== "granted" && nativeFg === true) {
    foreground = Location.PermissionStatus.GRANTED;
  }
  if (foreground !== "granted") {
    return {
      foreground,
      background: null,
      backgroundCanAskAgain: fg.canAskAgain,
    };
  }

  let expoBgStatus: string = Location.PermissionStatus.UNDETERMINED;
  let canAskAgain = true;
  try {
    const existingBg = await Location.getBackgroundPermissionsAsync();
    expoBgStatus = existingBg.status;
    canAskAgain = existingBg.canAskAgain;
  } catch {
    expoBgStatus = Location.PermissionStatus.UNDETERMINED;
    canAskAgain = true;
  }

  const nativeBg = await readNativeBackgroundGranted();
  if (shouldSkipBackgroundPermissionPrompt(expoBgStatus, nativeBg)) {
    return {
      foreground,
      background: Location.PermissionStatus.GRANTED,
      backgroundCanAskAgain: canAskAgain,
    };
  }

  const proceed = await showBackgroundRationale();
  if (!proceed) {
    return {
      foreground,
      background: asPermissionStatus(resolveBackgroundPermissionStatus(expoBgStatus, nativeBg)),
      backgroundCanAskAgain: canAskAgain,
    };
  }

  const bg = await Location.requestBackgroundPermissionsAsync();
  // Re-check native after Settings return (Android 11+ opens app location settings).
  const nativeAfter = await readNativeBackgroundGranted();
  return {
    foreground,
    background: asPermissionStatus(
      resolveBackgroundPermissionStatus(bg.status, nativeAfter),
    ),
    backgroundCanAskAgain: bg.canAskAgain,
  };
}

/** Open this app's system settings page (to grant "Allow all the time"). */
export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    /* ignore */
  }
}

/** Open app settings — preferred entry for location "Always" permission. */
export async function openLocationPermissionSettings(): Promise<void> {
  await openAppSettings();
}

/**
 * Open per-app battery optimization whitelist dialog (Android).
 * Falls back to generic optimization list, then app settings.
 */
export async function openAppBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  await IntentLauncher.startActivityAsync(
    "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" as IntentLauncher.ActivityAction,
    { data: buildBatteryOptimizationPackageUri(ANDROID_PACKAGE) },
  );
}

/**
 * Open the Android battery-optimization settings so the user can mark the app
 * as "not optimized". No-op on iOS. Falls back to generic list then app settings.
 */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await openAppBatteryOptimizationSettings();
  } catch {
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
      );
    } catch {
      await openAppSettings();
    }
  }
}

export async function wasBatteryPromptShown(): Promise<boolean> {
  return (await AsyncStorage.getItem(BATTERY_PROMPT_KEY)) === "1";
}

export async function markBatteryPromptShown(): Promise<void> {
  await AsyncStorage.setItem(BATTERY_PROMPT_KEY, "1");
}

export function isAndroid(): boolean {
  return Platform.OS === "android";
}
