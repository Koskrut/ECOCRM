import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { FIELD_LOCATION_TASK } from "./location-tracking-config";
import { STORAGE_KEYS } from "./location-tracking-buffer";
import {
  GPS_STOPPED_NOTIFY_COOLDOWN_MS,
  shouldSendGpsStoppedNotification,
  type GpsStoppedNotifyReason,
} from "./location-tracking-alerts-logic";

export { GPS_STOPPED_NOTIFY_COOLDOWN_MS, shouldSendGpsStoppedNotification } from "./location-tracking-alerts-logic";
export type { GpsStoppedNotifyReason } from "./location-tracking-alerts-logic";

export const GPS_STOPPED_ALERT_CHANNEL_ID = "crm-gps-stopped-v1";

const GPS_STOPPED_DEDUPE_KEY = "field_gps_stopped_notified_at";

const GPS_ZOMBIE_BODY =
  "GPS зупинено. Відкрийте CRM для відновлення відстеження.";

async function ensureGpsStoppedAlertChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(GPS_STOPPED_ALERT_CHANNEL_ID, {
      name: "GPS зупинено",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
      enableVibrate: true,
      sound: "default",
    });
  } catch {
    /* best-effort */
  }
}

async function sendGpsStoppedNotification(reason: GpsStoppedNotifyReason): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  const mode = await AsyncStorage.getItem(STORAGE_KEYS.TRACKING_MODE);
  const shiftId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
  if (!shiftId || mode !== "background") return false;

  const taskStarted = await Location.hasStartedLocationUpdatesAsync(FIELD_LOCATION_TASK).catch(
    () => false,
  );

  const raw = await AsyncStorage.getItem(GPS_STOPPED_DEDUPE_KEY);
  const lastNotifiedAtMs = raw ? Number(raw) : null;
  if (
    !shouldSendGpsStoppedNotification(
      mode,
      taskStarted,
      Number.isFinite(lastNotifiedAtMs) ? lastNotifiedAtMs : null,
      Date.now(),
      reason,
    )
  ) {
    return false;
  }

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return false;

  await ensureGpsStoppedAlertChannel();
  const isZombie = reason === "zombie_fgs";
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: isZombie ? "GPS зупинено — відкрийте CRM" : "GPS зупинено — відкрийте CRM",
        body: isZombie
          ? GPS_ZOMBIE_BODY
          : "Фоновий трек перервався. Відкрийте застосунок, щоб відновити запис маршруту.",
        sound: "default",
        data: { type: isZombie ? "gps_zombie" : "gps_stopped", screen: "today" },
        channelId: GPS_STOPPED_ALERT_CHANNEL_ID,
      } as Notifications.NotificationContentInput,
      trigger: null,
    });
    await AsyncStorage.setItem(GPS_STOPPED_DEDUPE_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/**
 * Local notification when background FGS died while app minimized.
 * Never starts FGS from here — user must open the app (Android 12+).
 */
export async function notifyGpsStoppedIfBackgroundTaskDead(): Promise<boolean> {
  return sendGpsStoppedNotification("task_dead");
}

/**
 * Zombie FGS: hasStartedLocationUpdatesAsync true but accept pipeline stale.
 * Foreground-only recovery — never start FGS from background.
 */
export async function notifyGpsStoppedZombieFgs(): Promise<boolean> {
  return sendGpsStoppedNotification("zombie_fgs");
}

export async function clearGpsStoppedNotificationDedupe(): Promise<void> {
  await AsyncStorage.removeItem(GPS_STOPPED_DEDUPE_KEY);
}
