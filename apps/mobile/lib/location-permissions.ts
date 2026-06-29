import AsyncStorage from "@react-native-async-storage/async-storage";
import * as IntentLauncher from "expo-intent-launcher";
import * as Location from "expo-location";
import { Alert, Linking, Platform } from "react-native";

import { t } from "./i18n";

export type TrackingPermissionStatus = {
  foreground: Location.PermissionStatus;
  background: Location.PermissionStatus | null;
  /** Whether the OS still allows prompting for background ("Allow all the time"). */
  backgroundCanAskAgain: boolean;
};

const BATTERY_PROMPT_KEY = "field_battery_opt_prompted";

/** Read current permission status without showing any system dialog. */
export async function getTrackingPermissionStatus(): Promise<TrackingPermissionStatus> {
  const fg = await Location.getForegroundPermissionsAsync();
  let background: Location.PermissionStatus | null = null;
  let backgroundCanAskAgain = false;
  if (fg.status === "granted") {
    const bg = await Location.getBackgroundPermissionsAsync();
    background = bg.status;
    backgroundCanAskAgain = bg.canAskAgain;
  }
  return { foreground: fg.status, background, backgroundCanAskAgain };
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
  if (fg.status !== "granted") {
    return {
      foreground: fg.status,
      background: null,
      backgroundCanAskAgain: fg.canAskAgain,
    };
  }

  const bg = await Location.requestBackgroundPermissionsAsync();
  return {
    foreground: fg.status,
    background: bg.status,
    backgroundCanAskAgain: bg.canAskAgain,
  };
}

/**
 * Request permissions with a short rationale before the background system dialog.
 * Use when starting a shift so users understand why «Always» is needed.
 */
export async function requestTrackingPermissionsWithRationale(): Promise<TrackingPermissionStatus> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    return {
      foreground: fg.status,
      background: null,
      backgroundCanAskAgain: fg.canAskAgain,
    };
  }

  const existingBg = await Location.getBackgroundPermissionsAsync();
  if (existingBg.status === "granted") {
    return {
      foreground: fg.status,
      background: existingBg.status,
      backgroundCanAskAgain: existingBg.canAskAgain,
    };
  }

  const proceed = await showBackgroundRationale();
  if (!proceed) {
    return {
      foreground: fg.status,
      background: existingBg.status,
      backgroundCanAskAgain: existingBg.canAskAgain,
    };
  }

  const bg = await Location.requestBackgroundPermissionsAsync();
  return {
    foreground: fg.status,
    background: bg.status,
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

/**
 * Open the Android battery-optimization settings so the user can mark the app
 * as "not optimized". No-op on iOS. Falls back to app settings on failure.
 */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
    );
  } catch {
    await openAppSettings();
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
